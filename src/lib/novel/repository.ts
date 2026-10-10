import fs from "fs";
import path from "path";
import { createHash, randomUUID } from "crypto";
import { load } from "cheerio";
import { getSqlite } from "@/lib/db";
import { getProfileDataDir, withProfile } from "@/lib/profiles";
import { decodeNovelBuffer, type NovelEncoding } from "@/lib/encoding";
import { NOVEL_ENCODINGS } from "@/lib/encoding-types";
import { parseEpub, readEpubChapter } from "@/lib/epub";
import { parseItemMetadata } from "@/lib/video-preferences";
import { assertProfile } from "./sessions";
import { digest, splitChapters, splitChunks } from "./chunks";
import { DEFAULT_PREFERENCES, RATES, type Chapter, type NovelBook, type NovelPreferences, type Position } from "./types";
import { validateComments } from "./comments";

interface Item { id: string; title: string; path: string; media_type: string; metadata: string | null; series_id: string }
interface ChapterRow { id: string; item_id: string; ordinal: number; title: string; text: string; digest: string; source_url: string | null; next_url: string | null }
export function novelItem(profileId: string, itemId: string): Item {
  assertProfile(profileId);
  return withProfile(profileId, () => {
    const item = getSqlite().prepare("SELECT * FROM media_items WHERE id = ? AND media_type = 'novel'").get(itemId) as Item | undefined;
    if (!item) throw new Error("小说不存在"); return item;
  });
}
export function preferences(raw: unknown): NovelPreferences {
  const v = { ...DEFAULT_PREFERENCES, ...(raw && typeof raw === "object" ? raw : {}) };
  return { version: 1, engine: v.engine === "system" ? "system" : "kokoro", voiceId: Number.isInteger(v.voiceId) && v.voiceId >= 3 && v.voiceId <= 102 ? v.voiceId : 3,
    rate: RATES.includes(v.rate) ? v.rate : 1, volume: Number.isFinite(v.volume) ? Math.max(0, Math.min(1, v.volume)) : 1,
    previousVolume: Number.isFinite(v.previousVolume) && v.previousVolume > 0 ? Math.min(1, v.previousVolume) : 1, follow: v.follow !== false };
}
export function savePreferences(profileId: string, itemId: string, input: unknown) {
  const item = novelItem(profileId, itemId), meta = parseItemMetadata(item.metadata), prefs = preferences(input);
  withProfile(profileId, () => getSqlite().prepare("UPDATE media_items SET metadata=? WHERE id=?").run(JSON.stringify({ ...meta, novelPreferences: prefs }), itemId));
  return prefs;
}
export function getPosition(profileId: string, itemId: string): Position | null {
  return withProfile(profileId, () => getSqlite().prepare("SELECT chapter_id AS chapterId,chunk_id AS chunkId,offset,digest,seconds,chunk_version AS chunkVersion FROM novel_reading_state WHERE item_id=?").get(itemId) as Position || null);
}
const localCache = new Map<string, { key: string; chapters: Chapter[]; encoding?: string }>();
export async function readChapters(profileId: string, itemId: string, encoding = "auto") {
  const item = novelItem(profileId, itemId);
  const stored = withProfile(profileId, () => getSqlite().prepare("SELECT * FROM novel_chapters WHERE item_id=? ORDER BY ordinal").all(itemId) as ChapterRow[]);
  if (stored.length) return { chapters: stored.map(r => ({ id: r.id, title: r.title, text: r.text, digest: r.digest, chunks: splitChunks(r.text), sourceURL: r.source_url || undefined, nextURL: r.next_url || undefined })), format: "txt" as const, encoding: "utf-8" };
  const stat = fs.statSync(item.path), ext = path.extname(item.path).toLowerCase();
  if (stat.size > 80 * 1024 * 1024) throw new Error("小说超过 80 MB，暂不支持听书");
  const key = `${stat.mtimeMs}:${stat.size}:${encoding}`, cacheId = `${profileId}:${itemId}`;
  const cached = localCache.get(cacheId);
  if (cached?.key === key) return { ...cached, format: ext === ".epub" ? "epub" as const : "txt" as const };
  let chapters: Chapter[], detected: string | undefined;
  if (ext === ".txt") {
    if (encoding !== "auto" && !NOVEL_ENCODINGS.some(e => e.id === encoding)) throw new Error("不支持的编码");
    const decoded = decodeNovelBuffer(fs.readFileSync(item.path), encoding === "auto" ? null : encoding as NovelEncoding);
    chapters = splitChapters(decoded.text); detected = decoded.encoding;
  } else if (ext === ".epub") {
    const book = await parseEpub(item.path); chapters = [];
    for (const ch of book.chapters) {
      const content = await readEpubChapter(item.path, ch.href, "html", href => `/api/novel?action=asset&profileId=${encodeURIComponent(profileId)}&itemId=${encodeURIComponent(itemId)}&href=${encodeURIComponent(href)}`);
      const $ = load(content.html); $("script,style,nav,iframe,noscript").each((_, el) => { if (el.tagName !== "style") $(el).remove(); });
      const chunks: Chapter["chunks"] = []; let text = "", n = 0;
      $("body").find("p,h1,h2,h3,h4,h5,h6,li,blockquote,div").filter((_, el) => $(el).find("p,h1,h2,h3,h4,h5,h6,li,blockquote,div").length === 0).each((_, el) => {
        const block = `rm-novel-${n++}`, raw = $(el).text();
        $(el).attr("data-novel-block", block);
        for (const c of splitChunks(raw, block)) chunks.push({ ...c, start: c.start + text.length, end: c.end + text.length, id: `${block}-${c.id}` });
        text += raw + "\n\n";
      });
      if (!chunks.length && $("body").text().trim()) { text = $("body").text(); chunks.push(...splitChunks(text)); }
      chapters.push({ id: `epub-${ch.id}`, title: ch.title, text, digest: digest(text), chunks, html: $.html() });
    }
  } else throw new Error("此格式暂不支持听书");
  assertProfile(profileId);
  if (localCache.size > 8) localCache.delete(localCache.keys().next().value!);
  localCache.set(cacheId, { key, chapters, encoding: detected });
  return { chapters, format: ext === ".epub" ? "epub" as const : "txt" as const, encoding: detected };
}
export async function getBook(profileId: string, itemId: string, encoding = "auto"): Promise<NovelBook> {
  const item = novelItem(profileId, itemId), content = await readChapters(profileId, itemId, encoding);
  let position = getPosition(profileId, itemId);
  if (position) {
    const saved = position, current = content.chapters.find(c => c.id === saved.chapterId);
    if (!current?.chunks.some(c => c.digest === saved.digest)) {
      const relocated = content.chapters.find(c => c.chunks.some(chunk => chunk.digest === saved.digest));
      if (relocated) position = { ...saved, chapterId: relocated.id, seconds: 0, chunkVersion: 0 };
    }
  }
  return { itemId, profileId, title: item.title, storagePath:item.path, format: content.format, chapters: content.chapters.map(c => ({ id: c.id, title: c.title })), preferences: preferences(parseItemMetadata(item.metadata).novelPreferences), position, encoding: content.encoding };
}
export async function getChapter(profileId: string, itemId: string, chapterId: string, encoding = "auto") {
  novelItem(profileId,itemId);
  const row=withProfile(profileId,()=>getSqlite().prepare("SELECT * FROM novel_chapters WHERE item_id=? AND id=?").get(itemId,chapterId) as ChapterRow|undefined);
  if(row){
    const stored=withProfile(profileId,()=>getSqlite().prepare("SELECT comments FROM novel_chapter_comments WHERE chapter_id=?").get(chapterId) as {comments:string}|undefined);
    return {id:row.id,title:row.title,text:row.text,digest:row.digest,chunks:splitChunks(row.text),sourceURL:row.source_url||undefined,nextURL:row.next_url||undefined,...(stored?{comments:validateComments(JSON.parse(stored.comments))}:{})} as Chapter;
  }
  const data = await readChapters(profileId, itemId, encoding);
  const chapter = data.chapters.find(c => c.id === chapterId);
  if (!chapter) throw new Error("章节已改变，请重新打开小说"); return chapter;
}
export async function savePosition(profileId: string, itemId: string, value: Position, encoding = "auto", played = true, guard = () => {}, completed = false, chapterCompleted = false) {
  const data = await readChapters(profileId, itemId, encoding); guard(); assertProfile(profileId);
  const ci = data.chapters.findIndex(c => c.id === value.chapterId), ch = data.chapters[ci], chunk = ch?.chunks.find(c => c.id === value.chunkId);
  if (!chunk || chunk.digest !== value.digest || value.offset !== chunk.start || !Number.isFinite(value.seconds) || value.seconds < 0 || value.seconds > 3600) throw new Error("续听位置无效");
  withProfile(profileId, () => {
    const db = getSqlite();
    db.prepare("INSERT OR REPLACE INTO novel_reading_state VALUES (?,?,?,?,?,?,?,?)").run(itemId, ch.id, chunk.id, chunk.start, chunk.digest, value.seconds, 1, Date.now());
    if (played) {
      const chapterProgress=(chapterCompleted||completed)&&chunk===ch.chunks[ch.chunks.length-1]?1:Math.min(.999,chunk.start/(ch.text.length||1));
      db.prepare("INSERT INTO novel_chapter_progress VALUES (?,?,?,?,?,?,?) ON CONFLICT(item_id,chapter_id) DO UPDATE SET digest=excluded.digest,progress=CASE WHEN digest=excluded.digest THEN MAX(progress,excluded.progress) ELSE excluded.progress END,offset=excluded.offset,seconds=excluded.seconds,updated_at=excluded.updated_at").run(itemId,ch.id,ch.digest,chapterProgress,chunk.start,value.seconds,Date.now());
      updateBookProgress(db,itemId,data.chapters);
    }
  });
}
function updateBookProgress(db: ReturnType<typeof getSqlite>, itemId: string, chapters: {id:string;digest:string;text:string}[]) {
  const saved = db.prepare("SELECT chapter_id,digest,progress FROM novel_chapter_progress WHERE item_id=?").all(itemId) as {chapter_id:string;digest:string;progress:number}[];
  const progress = new Map(saved.map(p => [p.chapter_id,p]));
  const total = chapters.reduce((n,c) => n+c.text.length,0) || 1;
  const read = chapters.reduce((n,c) => { const p=progress.get(c.id); return n+(p?.digest===c.digest?p.progress*c.text.length:0); },0);
  db.prepare("UPDATE media_items SET progress=? WHERE id=?").run(Math.min(1,read/total),itemId);
  db.prepare("UPDATE series SET progress=(SELECT AVG(progress) FROM media_items WHERE series_id=series.id) WHERE id=(SELECT series_id FROM media_items WHERE id=?)").run(itemId);
}
export async function chapterSummaries(profileId:string,itemId:string) {
  const book=await getBook(profileId,itemId),data=await readChapters(profileId,itemId);
  const saved=withProfile(profileId,()=>getSqlite().prepare("SELECT chapter_id,digest,progress FROM novel_chapter_progress WHERE item_id=?").all(itemId) as {chapter_id:string;digest:string;progress:number}[]);
  return {...book,chapters:data.chapters.map((ch,i)=>({id:ch.id,title:ch.title,order:i+1,characters:ch.text.length,segments:ch.chunks.length,progress:saved.find(p=>p.chapter_id===ch.id&&p.digest===ch.digest)?.progress||0,current:book.position?.chapterId===ch.id,sourceURL:ch.sourceURL}))};
}
export function importLocalBook(profileId:string,file:string) {
  assertProfile(profileId);const source=fs.realpathSync(file),ext=path.extname(source).toLowerCase();
  if(![".txt",".epub"].includes(ext)||!fs.statSync(source).isFile()||fs.statSync(source).size>80*1024*1024)throw new Error("请选择 80 MB 以内的 TXT 或 EPUB 文件");
  return withProfile(profileId,()=>{
    const db=getSqlite(),existing=db.prepare("SELECT id,series_id FROM media_items WHERE path=? AND media_type='novel'").get(source) as {id:string;series_id:string}|undefined;
    if(existing)return {itemId:existing.id,seriesId:existing.series_id,title:path.basename(source,ext)};
    const id=randomUUID(),seriesId=randomUUID(),title=path.basename(source,ext),now=Date.now();
    db.transaction(()=>{db.prepare("INSERT INTO series(id,title,media_type,item_count,created_at,updated_at) VALUES (?,?,'novel',1,?,?)").run(seriesId,title,now,now);db.prepare("INSERT INTO media_items(id,series_id,title,path,media_type,file_size,created_at,updated_at) VALUES (?,?,?,?,'novel',?,?,?)").run(id,seriesId,title,source,fs.statSync(source).size,now,now);})();
    return {itemId:id,seriesId,title};
  });
}
export function importUploadedBook(profileId:string,name:string,data:Buffer) {
  assertProfile(profileId);
  const filename=path.basename(name.replaceAll("\\","/")),ext=path.extname(filename).toLowerCase();
  if(![".txt",".epub"].includes(ext)||!data.length||data.length>80*1024*1024)throw new Error("请选择 80 MB 以内的 TXT 或 EPUB 文件");
  const hash=createHash("sha256").update(data).digest("hex");
  const dir=path.join(getProfileDataDir(profileId),"novels","local-files",hash);
  fs.mkdirSync(dir,{recursive:true});
  const existing=fs.readdirSync(dir).find(file=>path.extname(file).toLowerCase()===ext);
  const file=path.join(dir,existing||filename);
  if(!existing)fs.writeFileSync(file,data,{flag:"wx"});
  return importLocalBook(profileId,file);
}
export interface ImportedChapter { title: string; text: string; sourceURL?: string; nextURL?: string; comments?: string[] }
export function importChapters(profileId: string, sourceKey: string, title: string, inputs: ImportedChapter[], kind = "web") {
  assertProfile(profileId);
  return withProfile(profileId, () => {
    const db = getSqlite();
    const existing = db.prepare("SELECT item_id FROM novel_sources WHERE source_key=?").get(sourceKey) as { item_id: string } | undefined;
    const itemId = existing?.item_id || randomUUID(), seriesId = randomUUID();
    const dir = path.join(getProfileDataDir(profileId), "novels", itemId), now = Date.now();
    fs.mkdirSync(path.join(dir, "chapters"), { recursive: true });
    fs.writeFileSync(path.join(dir, "chapters", ".rm-novel-internal"), "1");
    const file = path.join(dir, "collection.txt");
    const ids: string[] = [];
    db.transaction(() => {
      if (!existing) {
        db.prepare("INSERT INTO series(id,title,media_type,item_count,created_at,updated_at) VALUES (?,?,'novel',1,?,?)").run(seriesId,title,now,now);
        db.prepare("INSERT INTO media_items(id,series_id,title,path,media_type,created_at,updated_at) VALUES (?,?,?,?,'novel',?,?)").run(itemId,seriesId,title,file,now,now);
        db.prepare("INSERT INTO novel_sources VALUES (?,?,?,?)").run(itemId,sourceKey,kind,null);
      }
      let ordinal = (db.prepare("SELECT COALESCE(MAX(ordinal),-1) AS n FROM novel_chapters WHERE item_id=?").get(itemId) as { n: number }).n + 1;
      for (const input of inputs) {
        const hash = digest(input.text);
        const found = db.prepare("SELECT id FROM novel_chapters WHERE item_id=? AND (source_url=? OR (? IS NULL AND digest=?))").get(itemId,input.sourceURL || null,input.sourceURL || null,hash) as { id: string } | undefined;
        if (found) {
          ids.push(found.id);
          if(input.comments!==undefined)db.prepare("INSERT OR REPLACE INTO novel_chapter_comments VALUES (?,?)").run(found.id,JSON.stringify(validateComments(input.comments)));
          continue;
        }
        const id = randomUUID(); ids.push(id);
        db.prepare("INSERT INTO novel_chapters VALUES (?,?,?,?,?,?,?,?)").run(id,itemId,ordinal++,input.title,input.text,hash,input.sourceURL || null,input.nextURL || null);
        if(input.comments!==undefined)db.prepare("INSERT INTO novel_chapter_comments VALUES (?,?)").run(id,JSON.stringify(validateComments(input.comments)));
      }
      const rows = db.prepare("SELECT * FROM novel_chapters WHERE item_id=? ORDER BY ordinal").all(itemId) as ChapterRow[];
      for (const row of rows) fs.writeFileSync(path.join(dir,"chapters",`${row.id}.txt`),row.text,"utf8");
      const temp = `${file}.tmp`;
      fs.writeFileSync(temp,rows.map(c => `${c.title}\n\n${c.text}`).join("\n\n"),"utf8"); fs.renameSync(temp,file);
      db.prepare("UPDATE media_items SET file_size=?,page_count=?,updated_at=? WHERE id=?").run(fs.statSync(file).size,rows.length,now,itemId);
      if (existing) updateBookProgress(db,itemId,rows);
      db.prepare("UPDATE series SET updated_at=? WHERE id=(SELECT series_id FROM media_items WHERE id=?)").run(now,itemId);
    })();
    return { itemId, chapterIds: ids, seriesId: novelItem(profileId,itemId).series_id, created: !existing };
  });
}
