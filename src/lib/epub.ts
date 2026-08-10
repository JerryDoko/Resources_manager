import fs from "fs";
import path from "path";
import JSZip from "jszip";

export interface EpubChapter {
  id: string;
  title: string;
  href: string;
}

export interface EpubBook {
  title: string;
  author: string | null;
  chapters: EpubChapter[];
}

function posixJoin(base: string, rel: string): string {
  const cleaned = rel.replace(/\\/g, "/").split("#")[0];
  if (cleaned.startsWith("/")) return cleaned.replace(/^\//, "");
  const dir = base.includes("/") ? base.slice(0, base.lastIndexOf("/") + 1) : "";
  const parts = (dir + cleaned).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

function decodeHref(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

function isExternalHref(href: string): boolean {
  return (
    href.startsWith("#") ||
    /^(?:https?:|data:|blob:|mailto:|tel:|javascript:)/i.test(href)
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Sanitize chapter HTML for safe iframe/srcDoc rendering */
export function sanitizeEpubHtml(
  html: string,
  baseHref: string,
  zipNames: Set<string>,
  assetUrlForHref?: (href: string) => string
): string {
  // Remove scripts and on* handlers
  let out = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "");

  // Inject basic reading styles
  const style = `<style>
    body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB",serif;
      line-height:1.85;color:#2a2418;background:#f4f0e6;padding:1.5rem;max-width:42rem;margin:0 auto;
      font-size:1.05rem;word-break:break-word;}
    img,svg image{max-width:100%;height:auto;}
    a{color:#1f6f6a;}
    h1,h2,h3{line-height:1.3;}
  </style>`;

  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${style}</head>`);
  } else if (/<body/i.test(out)) {
    out = out.replace(/<body[^>]*>/i, (m) => `${m}${style}`);
  } else {
    out = `<!DOCTYPE html><html><head><meta charset="utf-8">${style}</head><body>${out}</body></html>`;
  }

  if (assetUrlForHref) {
    const rewrite = (href: string) => {
      const raw = href.trim();
      if (!raw || isExternalHref(raw)) return href;
      const [withoutHash, hash = ""] = raw.split("#");
      const normalized = decodeHref(posixJoin(baseHref, withoutHash));
      if (!zipNames.has(normalized)) return href;
      return `${assetUrlForHref(normalized)}${hash ? `#${hash}` : ""}`;
    };

    out = out.replace(
      /\s(src|poster|xlink:href)\s*=\s*("[^"]*"|'[^']*')/gi,
      (match, attr: string, quoted: string) => {
        const quote = quoted[0];
        const value = quoted.slice(1, -1);
        return ` ${attr}=${quote}${rewrite(value)}${quote}`;
      }
    );

    out = out.replace(/url\((["']?)([^"')]+)\1\)/gi, (_match, quote: string, value: string) => {
      return `url(${quote}${rewrite(value)}${quote})`;
    });
  }

  return out;
}

export async function parseEpub(filePath: string): Promise<EpubBook> {
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files);

  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) throw new Error("无效的 EPUB：缺少 container.xml");

  const opfPath =
    containerXml.match(/full-path\s*=\s*"([^"]+)"/i)?.[1] ||
    containerXml.match(/full-path\s*=\s*'([^']+)'/i)?.[1];
  if (!opfPath) throw new Error("无效的 EPUB：找不到 OPF");

  const opf = await zip.file(opfPath)?.async("string");
  if (!opf) throw new Error(`无效的 EPUB：找不到 ${opfPath}`);

  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/")) : "";

  const title =
    opf.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i)?.[1]?.trim() ||
    path.basename(filePath, ".epub");
  const author =
    opf.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i)?.[1]?.trim() || null;

  // manifest id -> href
  const manifest = new Map<string, { href: string; mediaType: string }>();
  const manifestBlock = opf.match(/<manifest[^>]*>([\s\S]*?)<\/manifest>/i)?.[1] || "";
  const itemRe = /<item\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(manifestBlock))) {
    const attrs = m[1];
    const id = attrs.match(/\bid\s*=\s*"([^"]+)"/i)?.[1];
    const href = attrs.match(/\bhref\s*=\s*"([^"]+)"/i)?.[1];
    const mediaType = attrs.match(/\bmedia-type\s*=\s*"([^"]+)"/i)?.[1] || "";
    if (id && href) manifest.set(id, { href, mediaType });
  }

  // spine
  const spineBlock = opf.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i)?.[1] || "";
  const spineIds: string[] = [];
  const refRe = /<itemref\b([^>]*)\/?>/gi;
  while ((m = refRe.exec(spineBlock))) {
    const idref = m[1].match(/\bidref\s*=\s*"([^"]+)"/i)?.[1];
    if (idref) spineIds.push(idref);
  }

  // nav / toc for titles (EPUB3 nav or NCX)
  const titleByHref = new Map<string, string>();
  const navItem = [...manifest.values()].find(
    (v) =>
      v.mediaType.includes("xml") &&
      (v.href.toLowerCase().includes("nav") || v.mediaType.includes("navigation"))
  );
  const ncxItem =
    [...manifest.entries()].find(([, v]) => v.mediaType.includes("ncx") || v.href.endsWith(".ncx"))?.[1] ||
    [...manifest.values()].find((v) => v.href.toLowerCase().endsWith(".ncx"));

  async function loadTocTitles(tocHref: string) {
    const full = posixJoin(opfDir, tocHref);
    const tocXml = await zip.file(full)?.async("string");
    if (!tocXml) return;
    // nav li > a
    const aRe = /<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let a: RegExpExecArray | null;
    while ((a = aRe.exec(tocXml))) {
      const href = posixJoin(path.posix.dirname(full), a[1].split("#")[0]);
      const t = stripHtml(a[2]).trim();
      if (t) titleByHref.set(href, t);
    }
    // NCX navPoint
    const npRe =
      /<navPoint[\s\S]*?<text>([^<]*)<\/text>[\s\S]*?<content[^>]*src\s*=\s*"([^"]+)"/gi;
    while ((a = npRe.exec(tocXml))) {
      const href = posixJoin(path.posix.dirname(full), a[2].split("#")[0]);
      const t = a[1].trim();
      if (t) titleByHref.set(href, t);
    }
  }

  if (navItem) await loadTocTitles(navItem.href);
  if (ncxItem) await loadTocTitles(ncxItem.href);

  const chapters: EpubChapter[] = [];
  let idx = 0;
  for (const id of spineIds) {
    const item = manifest.get(id);
    if (!item) continue;
    if (!/html|xml|xhtml/i.test(item.mediaType) && !/\.x?html?$/i.test(item.href)) continue;
    const fullHref = posixJoin(opfDir, item.href);
    if (!names.includes(fullHref) && !zip.file(fullHref)) continue;
    idx++;
    chapters.push({
      id: String(idx),
      title: titleByHref.get(fullHref) || `第 ${idx} 章`,
      href: fullHref,
    });
  }

  if (chapters.length === 0) {
    // Fallback: all html files
    const htmlFiles = names
      .filter((n) => /\.x?html?$/i.test(n) && !zip.files[n].dir)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    htmlFiles.forEach((href, i) => {
      chapters.push({
        id: String(i + 1),
        title: titleByHref.get(href) || `第 ${i + 1} 章`,
        href,
      });
    });
  }

  return { title, author, chapters };
}

export async function readEpubChapter(
  filePath: string,
  chapterHref: string,
  as: "html" | "text" = "html",
  assetUrlForHref?: (href: string) => string
): Promise<{ html: string; text: string }> {
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file(chapterHref);
  if (!file) throw new Error(`章节不存在: ${chapterHref}`);
  const raw = await file.async("string");
  const names = new Set(Object.keys(zip.files));
  const html = sanitizeEpubHtml(raw, chapterHref, names, assetUrlForHref);
  const text = stripHtml(raw);
  return as === "text" ? { html, text } : { html, text };
}

export async function readEpubAsset(
  filePath: string,
  href: string
): Promise<{ data: Buffer; href: string }> {
  const buf = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buf);
  const normalized = decodeHref(href.replace(/\\/g, "/").replace(/^\/+/, "").split("#")[0]);
  const file = zip.file(normalized);
  if (!file || file.dir) throw new Error(`资源不存在: ${href}`);
  return {
    data: Buffer.from(await file.async("uint8array")),
    href: normalized,
  };
}
