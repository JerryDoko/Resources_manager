import { getSqlite } from "@/lib/db";
import { withProfile } from "@/lib/profiles";
import { assertProfile, captureNovelWorkspace } from "./sessions";
import { getPosition, importChapters, savePreferences, savePosition, getChapter, preferences } from "./repository";
import { parseItemMetadata } from "@/lib/video-preferences";
import type { NovelPreferences, Position } from "./types";
import { validateComments } from "./comments";
interface ArchiveBook { sourceKey:string;title:string;chapters:{id:string;title:string;text:string;sourceURL?:string;nextURL?:string;comments?:string[]}[];preferences:NovelPreferences;position:Position|null;chapterProgress?:{chapterId:string;digest:string;progress:number;offset:number;seconds:number}[] }
export function exportNovelArchive(profileId:string) {
  assertProfile(profileId);return withProfile(profileId,()=>{
    const db=getSqlite(),rows=db.prepare("SELECT s.source_key,i.id,i.title,i.metadata FROM novel_sources s JOIN media_items i ON i.id=s.item_id").all() as {source_key:string;id:string;title:string;metadata:string|null}[];
    return {version:2,kind:"resources-manager-novels",books:rows.map(r=>({sourceKey:r.source_key,title:r.title,preferences:preferences(parseItemMetadata(r.metadata).novelPreferences),position:getPosition(profileId,r.id),chapterProgress:db.prepare("SELECT chapter_id AS chapterId,digest,progress,offset,seconds FROM novel_chapter_progress WHERE item_id=?").all(r.id),chapters:(db.prepare("SELECT c.id,c.title,c.text,c.source_url AS sourceURL,c.next_url AS nextURL,m.comments FROM novel_chapters c LEFT JOIN novel_chapter_comments m ON m.chapter_id=c.id WHERE c.item_id=? ORDER BY c.ordinal").all(r.id) as {id:string;title:string;text:string;sourceURL?:string;nextURL?:string;comments:string|null}[]).map(c=>({...c,comments:c.comments?validateComments(JSON.parse(c.comments)):undefined}))}))};
  });
}
export async function restoreNovelArchive(profileId:string,input:unknown) {
  const guard=captureNovelWorkspace(profileId);
  const data=input as {kind?:string;books?:ArchiveBook[]};if(data?.kind!=="resources-manager-novels"||!Array.isArray(data.books))throw new Error("小说资料格式无效");
  let created=0;
  for(const book of data.books){
    guard();
    if(typeof book.sourceKey!=="string"||typeof book.title!=="string"||!Array.isArray(book.chapters)||book.chapters.some(c=>typeof c.text!=="string"||typeof c.title!=="string"))throw new Error("小说章节无效");
    const r=importChapters(profileId,book.sourceKey,book.title,book.chapters,"archive");if(!r.created)continue;created++;
    savePreferences(profileId,r.itemId,book.preferences);
    for(const progress of book.chapterProgress||[]){const ci=book.chapters.findIndex(ch=>ch.id===progress.chapterId);if(ci<0||!Number.isFinite(progress.progress)||progress.progress<0||progress.progress>1)continue;withProfile(profileId,()=>getSqlite().prepare("INSERT OR REPLACE INTO novel_chapter_progress VALUES (?,?,?,?,?,?,?)").run(r.itemId,r.chapterIds[ci],progress.digest,progress.progress,progress.offset,progress.seconds,Date.now()));}
    const index=book.chapters.findIndex(c=>c.id===book.position?.chapterId);
    if(index>=0&&book.position){const ch=await getChapter(profileId,r.itemId,r.chapterIds[index]);guard();const chunk=ch.chunks.find(c=>c.digest===book.position!.digest)||ch.chunks[0];if(chunk)await savePosition(profileId,r.itemId,{...book.position,chapterId:ch.id,chunkId:chunk.id,offset:chunk.start,digest:chunk.digest},"auto",true,guard);}
  }return {created};
}
