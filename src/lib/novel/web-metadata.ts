import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { load } from "cheerio";
import sharp from "sharp";
import { getSqlite } from "@/lib/db";
import { getProfileDataDir, withProfile } from "@/lib/profiles";
import { parseItemMetadata } from "@/lib/video-preferences";
import { captureNovelWorkspace } from "./sessions";
import { novelItem } from "./repository";
import type { WebExtension } from "./web-extensions";

export interface WebBookMetadata { bookTitle?: string; tags?: string[]; coverURL?: string }
export function expandWebTemplate(template: string, source: string) {
  const segments = new URL(source).pathname.split("/").filter(Boolean);
  return template.replace(/\{([0-9])\}/g, (_, index) => {
    const value = segments[Number(index)];
    if (!value || !/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error("书籍信息路径参数无效");
    return value;
  });
}
export function assertCoverURL(value: string, extension: WebExtension) {
  const u = new URL(value);
  const permitted = extension.transport === "json" ? [] : [...extension.origins, ...(extension.metadata?.coverOrigins || [])];
  if (u.protocol !== "https:" || u.username || u.password || !permitted.includes(u.origin)) throw new Error("封面来源不在扩展允许范围内");
  u.hash = "";
  return u.href;
}
export function parseWebMetadata(html: string, source: string, extension: WebExtension, details = false, templateSource = source): WebBookMetadata {
  if (extension.transport === "json" || !extension.metadata) return {};
  const rules = details ? extension.metadata.details : extension.metadata;
  if (!rules) return {};
  const $ = load(html), select = (css: string) => $(expandWebTemplate(css, templateSource));
  const bookTitle = details && "bookTitle" in rules && rules.bookTitle ? select(rules.bookTitle).first().text().trim().slice(0,300) : undefined;
  const tags = rules.tags ? [...new Set(select(rules.tags).toArray().map(node => $(node).text().trim().slice(0,80)).filter(Boolean))].slice(0,50) : undefined;
  const image = rules.cover ? select(rules.cover).first() : null;
  const src = image?.attr("data-src") || image?.attr("src") || image?.attr("content");
  let coverURL: string | undefined;
  if (src) { try { coverURL = assertCoverURL(new URL(src, source).href, extension); } catch { /* Ignore images outside the declared sources. */ } }
  return { ...(bookTitle ? {bookTitle} : {}), ...(tags ? {tags} : {}), ...(coverURL ? {coverURL} : {}) };
}
export async function saveWebMetadata(profileId: string, itemId: string, info: WebBookMetadata, cover?: Buffer) {
  const guard = captureNovelWorkspace(profileId);novelItem(profileId,itemId);
  const coverPath = path.join(getProfileDataDir(profileId),"novels",itemId,"web-cover.webp");
  let savedCover: string | undefined;
  if (cover) {
    // Decode before writing; .file URLs may contain valid images without an image suffix.
    const data = await sharp(cover,{limitInputPixels:40_000_000}).rotate().resize(480,672,{fit:"inside",withoutEnlargement:true}).webp({quality:78}).toBuffer();
    guard();fs.mkdirSync(path.dirname(coverPath),{recursive:true});
    const temp = `${coverPath}.${randomUUID()}.tmp`;
    try { fs.writeFileSync(temp,data);fs.renameSync(temp,coverPath);savedCover=coverPath; }
    finally { fs.rmSync(temp,{force:true}); }
  }
  guard();
  withProfile(profileId,()=>{
    const db=getSqlite(), current=novelItem(profileId,itemId), meta=parseItemMetadata(current.metadata);
    const old = meta.webNovel && typeof meta.webNovel === "object" ? meta.webNovel as WebBookMetadata : {};
    const title=info.bookTitle?.trim().slice(0,300);
    db.transaction(()=>{
      if(title&&(current.title===old.bookTitle||current.title===title||/^网页小说（/.test(current.title))){
        db.prepare("UPDATE series SET title=? WHERE id=? AND title=?").run(title,current.series_id,current.title);
        db.prepare("UPDATE media_items SET title=? WHERE id=?").run(title,itemId);
      }
      for(const name of info.tags||[]){
        const tag = db.prepare("SELECT id FROM tags WHERE name=?").get(name) as {id:string}|undefined;
        const id=tag?.id||randomUUID();
        if(!tag)db.prepare("INSERT INTO tags(id,name,created_at) VALUES (?,?,?)").run(id,name,Date.now());
        db.prepare("INSERT OR IGNORE INTO series_tags(series_id,tag_id) SELECT ?,? WHERE NOT EXISTS (SELECT 1 FROM series_tags WHERE series_id=? AND tag_id=?)").run(current.series_id,id,current.series_id,id);
      }
      if(savedCover){
        db.prepare("UPDATE media_items SET thumbnail_path=? WHERE id=? AND (thumbnail_path IS NULL OR thumbnail_path=?)").run(savedCover,itemId,coverPath);
        db.prepare("UPDATE series SET thumbnail_path=? WHERE id=? AND (thumbnail_path IS NULL OR thumbnail_path=?)").run(savedCover,current.series_id,coverPath);
      }
      db.prepare("UPDATE media_items SET metadata=? WHERE id=?").run(JSON.stringify({...meta,webNovel:{...old,...info}}),itemId);
    })();
  });
}
