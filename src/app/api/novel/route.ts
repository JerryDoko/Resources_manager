import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Readable } from "node:stream";
import { getActiveProfileId } from "@/lib/profiles";
import { assertProfile, assertSession, beginSession, cancelSession, captureNovelWorkspace } from "@/lib/novel/sessions";
import { getBook, getChapter, novelItem, savePosition, savePreferences,chapterSummaries,importLocalBook,importUploadedBook } from "@/lib/novel/repository";
import { kokoroStatus, tts } from "@/lib/novel/tts-service";
import { importWeb, nextChapter, openWebBrowser } from "@/lib/novel/web-import";
import { importLegacy, previewLegacy } from "@/lib/novel/legacy-import";
import { exportNovelArchive, restoreNovelArchive } from "@/lib/novel/archive";
import { readEpubAsset } from "@/lib/epub";
import { PREVIEW_TEXT } from "@/lib/novel/types";
import { installation, installRuntime, installEngine } from "@/lib/novel/runtime-install";
import { getPerformance, savePerformance, threadLimit } from "@/lib/novel/performance-settings";
import { benchmarkPerformance } from "@/lib/novel/runtime-benchmark";
import { webExtension, webExtensions, installWebExtension, removeWebExtension, setWebExtensionEnabled } from "@/lib/novel/web-extensions";
import {startAudioExport,audioExportStatus,audioExportFile,cancelAudioExport} from "@/lib/novel/audio-export";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const root=globalThis as typeof globalThis & { rmNovelAudio?:Map<string,{profileId:string;itemId:string;path:string}> };
const audio=root.rmNovelAudio ||= new Map();
const json=(data:unknown)=>NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
const fail=(e:unknown)=>NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});
export async function GET(req:NextRequest){
  try{
    const q=req.nextUrl.searchParams,action=q.get("action"),profileId=q.get("profileId")||getActiveProfileId();assertProfile(profileId);
    if(action==="context")return json({profileId,...kokoroStatus(),webExtension:webExtension(profileId),webExtensions:webExtensions(profileId)});
    if(action==="runtime-status")return json(installation());
    if(action==="performance")return json({profileId,settings:getPerformance(),maxThreads:threadLimit()});
    if(action==="export")return new NextResponse(JSON.stringify(exportNovelArchive(profileId),null,2),{headers:{"Content-Type":"application/json","Content-Disposition":"attachment; filename=novel-books.json"}});
    const itemId=q.get("itemId")||"",item=novelItem(profileId,itemId);
    if(action==="audio-export-status")return json(audioExportStatus(profileId,itemId,q.get("id")||""));
    if(action==="audio-export-download"){
      const {file,filename}=audioExportFile(profileId,itemId,q.get("id")||"");
      return new NextResponse(Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>,{headers:{"Content-Type":filename.endsWith(".zip")?"application/zip":"audio/wav","Content-Length":String(fs.statSync(file).size),"Content-Disposition":`attachment; filename=novel-audio.${filename.endsWith(".zip")?"zip":"wav"}; filename*=UTF-8''${encodeURIComponent(filename)}`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
    }
    if(action==="asset"){
      const asset=await readEpubAsset(item.path,q.get("href")||"");assertProfile(profileId);
      const ext=path.extname(asset.href).toLowerCase();const mime:Record<string,string>={".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".gif":"image/gif",".webp":"image/webp",".svg":"image/svg+xml",".css":"text/css"};
      return new NextResponse(new Uint8Array(asset.data),{headers:{"Content-Type":mime[ext]||"application/octet-stream","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; sandbox","X-Content-Type-Options":"nosniff"}});
    }
    if(action==="audio"){
      const grant=audio.get(q.get("id")||"");if(!grant||grant.profileId!==profileId||grant.itemId!==itemId)throw new Error("音频资源无效");
      const data=fs.readFileSync(grant.path),range=req.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/);
      const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(data.length-1,Number(range[2])):data.length-1;
      if(start>end||start>=data.length)return new NextResponse(null,{status:416});
      return new NextResponse(new Uint8Array(data.subarray(start,end+1)),{status:range?206:200,headers:{"Content-Type":"audio/wav","Accept-Ranges":"bytes","Content-Length":String(end-start+1),...(range?{"Content-Range":`bytes ${start}-${end}/${data.length}`}:{})}});
    }
    throw new Error("未知小说请求");
  }catch(e){return fail(e);}
}
export async function POST(req:NextRequest){
  try {
    const origin=req.headers.get("origin");if(origin&&new URL(origin).host!==req.headers.get("host"))throw new Error("仅允许本机应用请求");
    if(req.headers.get("content-type")?.startsWith("multipart/form-data")){
      if(Number(req.headers.get("content-length"))>81*1024*1024)throw new Error("小说文件不能超过 80 MB");
      const profileId=req.nextUrl.searchParams.get("profileId")||"";
      const valid=captureNovelWorkspace(profileId);
      const form=await req.formData(),file=form.get("file");valid();
      if(form.get("profileId")!==profileId)throw new Error("工作区不匹配");
      if(!(file instanceof File)||file.size>80*1024*1024)throw new Error("请选择 80 MB 以内的 TXT 或 EPUB 文件");
      const data=Buffer.from(await file.arrayBuffer());valid();
      return json(importUploadedBook(profileId,file.name,data));
    }
    const body=await req.json(),{action,profileId,itemId,sessionId}=body;assertProfile(profileId);
    if(action==="install-engine")return json(installEngine(body.confirmed));
    if(action==="extension-install")return json(installWebExtension(profileId,body.extension,body.confirmed));
    if(action==="extension-remove"){removeWebExtension(profileId,body.id);return json({ok:true});}
    if(action==="extension-enabled")return json(setWebExtensionEnabled(profileId,body.id,body.enabled));
    if(action==="install-runtime")return json(installRuntime(body.directory));
    if(action==="performance-save")return json(savePerformance(body.settings));
    if(action==="performance-test"){
      if(installation().running)throw new Error("声音包正在安装，请稍后测试");
      return json(await benchmarkPerformance(body.settings));
    }
    if(action==="local-import")return json(importLocalBook(profileId,body.file));
    if(action==="web")return json(await importWeb(profileId,body.url));
    if(action==="web-open")return json(await openWebBrowser(profileId,body.url));
    if(action==="legacy-preview")return json(previewLegacy(profileId,body.directory));
    if(action==="legacy-import")return json(await importLegacy(profileId,body.token));
    if(action==="restore")return json(await restoreNovelArchive(profileId,body.archive));
    novelItem(profileId,itemId);
    if(action==="audio-export-start")return json(await startAudioExport(profileId,itemId,body.chapterIds,body.voiceId,body.encoding));
    if(action==="audio-export-cancel")return json(cancelAudioExport(profileId,itemId,body.id));
    if(action==="book")return json(await getBook(profileId,itemId,body.encoding));
    if(action==="chapters-summary")return json(await chapterSummaries(profileId,itemId));
    if(action==="chapter")return json(await getChapter(profileId,itemId,body.chapterId,body.encoding));
    if(action==="preferences")return json(savePreferences(profileId,itemId,body.preferences));
    if(action==="reading-progress"){const guard=captureNovelWorkspace(profileId);await savePosition(profileId,itemId,body.position,body.encoding,body.played!==false,guard);return json({ok:true});}
    if(action==="begin")return json(beginSession(profileId,itemId));
    if(action==="cancel"){cancelSession(sessionId);return json({ok:true});}
    assertSession(profileId,itemId,sessionId);
    if(action==="heartbeat")return json({ok:true});
    if(action==="next")return json(await nextChapter(profileId,itemId,body.chapterId,sessionId,body.encoding));
    if(action==="progress") {await savePosition(profileId,itemId,body.position,body.encoding,body.played!==false,()=>assertSession(profileId,itemId,sessionId),body.completed===true,body.chapterCompleted===true);return json({ok:true});}
    if(action==="synthesize"||action==="preview"){
      if(installation().running)throw new Error("声音包正在安装，请稍后朗读");
      let text=PREVIEW_TEXT;
      if(action==="synthesize"){const chapter=await getChapter(profileId,itemId,body.chapterId,body.encoding);const chunk=chapter.chunks.find(c=>c.id===body.chunkId);if(!chunk)throw new Error("朗读片段不存在");text=chunk.text;}
      assertSession(profileId,itemId,sessionId);
      const result=await tts().synthesize({profileId,itemId,sessionId,text,voiceId:body.voiceId,priority:body.priority==="prefetch"?"prefetch":"foreground"});
      assertSession(profileId,itemId,sessionId);const id=randomUUID();audio.set(id,{profileId,itemId,path:result.path});if(audio.size>2000)audio.delete(audio.keys().next().value!);
      return json({url:`/api/novel?action=audio&profileId=${encodeURIComponent(profileId)}&itemId=${encodeURIComponent(itemId)}&id=${id}`,cached:result.cached,duration:result.duration,elapsed:result.elapsed});
    }
    throw new Error("未知小说操作");
  }catch(e){return fail(e);}
}
