import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { assertProfile, captureNovelWorkspace } from "./sessions";
import { legacyChunkOffset } from "./chunks";
import { getChapter, getPosition, importChapters, savePosition, savePreferences } from "./repository";
interface OldChapter { id:string;title:string;fileName:string;sourceURL?:string;nextURL?:string }
interface OldBook { id:string;title:string;sourceKey?:string;chapters:OldChapter[];chapterIndex?:number;chunkIndex?:number }
interface Catalog { books:OldBook[];speed?:number;kokoroSpeaker?:number;volume?:number;previousVolume?:number }
const globalPreviews=globalThis as typeof globalThis & { rmLegacyPreviews?:Map<string,{profileId:string;directory:string;catalog:Catalog;expires:number}> };
const previews=globalPreviews.rmLegacyPreviews ||= new Map();
function readInside(directory:string,book:string,file:string) {
  const root=fs.realpathSync(directory),target=fs.realpathSync(path.resolve(root,book,file));
  if(!target.startsWith(root+path.sep)||fs.statSync(target).size>30*1024*1024)throw new Error("旧书章节路径或大小无效");return fs.readFileSync(target,"utf8");
}
export function previewLegacy(profileId:string,directory:string) {
  assertProfile(profileId);const raw=readInside(directory,"","catalog.json");const catalog=JSON.parse(raw) as Catalog;
  if(!Array.isArray(catalog.books)||catalog.books.length>10000)throw new Error("听页目录缺少有效的 catalog.json");
  for(const book of catalog.books) {if(typeof book.id!=="string"||typeof book.title!=="string"||!Array.isArray(book.chapters))throw new Error("旧书库结构无效");for(const ch of book.chapters)readInside(directory,book.id,ch.fileName);}
  for(const [id,p] of previews)if(p.expires<Date.now())previews.delete(id);
  const token=randomUUID();previews.set(token,{profileId,directory,catalog,expires:Date.now()+10*60*1000});
  return {token,books:catalog.books.map(b=>({title:b.title,chapters:b.chapters.length})),totalChapters:catalog.books.reduce((n,b)=>n+b.chapters.length,0)};
}
export async function importLegacy(profileId:string,token:string) {
  const guard=captureNovelWorkspace(profileId);const p=previews.get(token);if(!p||p.profileId!==profileId||p.expires<Date.now())throw new Error("预览已过期，请重新选择目录");
  let created=0,reused=0;
  for(const book of p.catalog.books) {
    guard();
    const chapters=book.chapters.map((c:OldChapter)=>({title:c.title,text:readInside(p.directory,book.id,c.fileName),sourceURL:c.sourceURL,nextURL:c.nextURL}));if(!chapters.length)continue;
    const key=book.sourceKey||`tingye:${book.id}`;
    const result=importChapters(profileId,key,book.title,chapters,"tingye");if(result.created)created++;else reused++;
    if(result.created&&!getPosition(profileId,result.itemId)) {
      const index=Math.max(0,Math.min(chapters.length-1,book.chapterIndex||0));
      const offset=legacyChunkOffset(chapters[index].text,book.chunkIndex||0);const ch=await getChapter(profileId,result.itemId,result.chapterIds[index]);guard();
      const chunk=ch.chunks.find(c=>c.end>offset)||ch.chunks[ch.chunks.length-1];
      if(chunk)await savePosition(profileId,result.itemId,{chapterId:ch.id,chunkId:chunk.id,offset:chunk.start,digest:chunk.digest,seconds:0,chunkVersion:1},"auto",true,guard);
      guard();
      savePreferences(profileId,result.itemId,{voiceId:p.catalog.kokoroSpeaker,volume:p.catalog.volume,rate:p.catalog.speed,previousVolume:p.catalog.previousVolume});
    }
  }
  return {created,reused};
}
