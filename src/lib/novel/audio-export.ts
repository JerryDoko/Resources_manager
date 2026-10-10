import fs from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {pipeline} from "node:stream/promises";
import JSZip from "jszip";
import {getProfileDataDir} from "@/lib/profiles";
import {getBook,getChapter,novelItem} from "./repository";
import {assertSession,beginExportSession,cancelSession,captureNovelWorkspace,onSessionCancel} from "./sessions";
import {kokoroStatus,tts} from "./tts-service";
import {installation} from "./runtime-install";
import {WavWriter} from "./wav-export";
import type {Chapter} from "./types";

type Job={id:string;profileId:string;itemId:string;sessionId:string;status:"running"|"done"|"cancelled"|"error";done:number;total:number;chapter:string;error:string;filename:string;file:string;directory:string;created:number};
const globalJobs=globalThis as typeof globalThis & {rmNovelExports?:Map<string,Job>};
const jobs=globalJobs.rmNovelExports ||= new Map();
const safeName=(value:string)=>value.replace(/[\\/:*?"<>|\x00-\x1f]/g,"_").slice(0,70).trim()||"小说";
export function audioExportStatus(profileId:string,itemId:string,id:string){
  novelItem(profileId,itemId);const job=jobs.get(id);
  if(!job||job.profileId!==profileId||job.itemId!==itemId)throw new Error("语音导出任务不存在或已失效");
  if(job.status==="done"&&!fs.existsSync(job.file))throw new Error("已生成的语音文件不存在，请重新生成");
  return {id:job.id,status:job.status,done:job.done,total:job.total,chapter:job.chapter,error:job.error,filename:job.filename};
}
export function audioExportFile(profileId:string,itemId:string,id:string){
  const status=audioExportStatus(profileId,itemId,id),job=jobs.get(id)!;
  if(status.status!=="done"||!fs.existsSync(job.file))throw new Error("语音尚未导出完成");
  return {file:job.file,filename:job.filename};
}
export function cancelAudioExport(profileId:string,itemId:string,id:string){
  audioExportStatus(profileId,itemId,id);const job=jobs.get(id)!;
  if(job.status==="running")cancelSession(job.sessionId);
  return audioExportStatus(profileId,itemId,id);
}
onSessionCancel(id=>{for(const job of jobs.values())if(job.sessionId===id&&job.status==="running")job.status="cancelled";});
export async function startAudioExport(profileId:string,itemId:string,chapterIds:unknown,voiceId:unknown,encoding="auto"){
  const workspace=captureNovelWorkspace(profileId);
  if(!kokoroStatus().available)throw new Error("导出语音需要安装本地 Kokoro 引擎和声音包");
  if(installation().running)throw new Error("声音包正在安装，请稍后导出");
  if(!Array.isArray(chapterIds)||!chapterIds.length||chapterIds.length>500||chapterIds.some(id=>typeof id!=="string")||new Set(chapterIds).size!==chapterIds.length)throw new Error("请选择 1 到 500 个已保存的章节");
  if(!Number.isInteger(voiceId)||Number(voiceId)<3||Number(voiceId)>102)throw new Error("请选择有效的中文音色");
  if([...jobs.values()].some(j=>j.profileId===profileId&&j.status==="running"))throw new Error("当前工作区已有语音导出任务");
  const book=await getBook(profileId,itemId,encoding);workspace();
  const selected=book.chapters.filter(c=>chapterIds.includes(c.id));
  if(selected.length!==chapterIds.length)throw new Error("只能导出已保存的章节，请刷新目录");
  const chapters:Chapter[]=[];
  for(const chapter of selected){chapters.push(await getChapter(profileId,itemId,chapter.id,encoding));workspace();}
  // Preparation can yield; enforce the one-job limit again before claiming a session.
  if([...jobs.values()].some(j=>j.profileId===profileId&&j.status==="running"))throw new Error("当前工作区已有语音导出任务");
  for(const [id,job] of jobs)if(job.status!=="running"&&Date.now()-job.created>86400000){fs.rmSync(job.directory,{recursive:true,force:true});jobs.delete(id);}
  const session=beginExportSession(profileId,itemId),id=randomUUID(),directory=path.join(getProfileDataDir(profileId),"novel-audio","exports",id);
  fs.mkdirSync(directory,{recursive:true});
  const job:Job={id,profileId,itemId,sessionId:session.id,status:"running",done:0,total:chapters.reduce((n,c)=>n+c.chunks.filter(chunk=>chunk.speech).length,0),chapter:"",error:"",filename:`${safeName(book.title)}${chapters.length===1?`-${safeName(chapters[0].title)}.wav`:"-语音.zip"}`,file:"",directory,created:Date.now()};
  jobs.set(id,job);
  void generate(job,chapters,Number(voiceId),workspace);
  return audioExportStatus(profileId,itemId,id);
}
async function generate(job:Job,chapters:Chapter[],voiceId:number,workspace:()=>void){
  const valid=()=>{workspace();assertSession(job.profileId,job.itemId,job.sessionId);};
  try{
    const files:string[]=[];let size=0;
    for(const [index,chapter] of chapters.entries()){
      valid();job.chapter=chapter.title;
      const file=path.join(job.directory,`${String(index+1).padStart(3,"0")}-${safeName(chapter.title)}.wav`),writer=new WavWriter(file);
      try{
        for(const chunk of chapter.chunks){if(!chunk.speech)continue;valid();const clip=await tts().synthesize({profileId:job.profileId,itemId:job.itemId,sessionId:job.sessionId,text:chunk.text,voiceId,priority:"export"});valid();writer.append(clip.path);job.done++;}
        size+=writer.finish();
      }finally{writer.close();}
      if(size>1024*1024*1024)throw new Error("导出音频超过 1 GB，请分批导出");files.push(file);
    }
    valid();
    if(files.length===1)job.file=files[0];
    else{
      const zip=new JSZip();for(const file of files)zip.file(path.basename(file),fs.createReadStream(file));
      job.file=path.join(job.directory,"chapters.zip");
      await pipeline(zip.generateNodeStream({streamFiles:true,compression:"STORE"}),fs.createWriteStream(job.file));
    }
    valid();job.status="done";
  }catch(error){if(job.status!=="cancelled"){job.status="error";job.error=error instanceof Error?error.message:String(error);}fs.rmSync(job.directory,{recursive:true,force:true});}
  finally{cancelSession(job.sessionId);}
}
