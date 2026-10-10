"use client";
import {useEffect,useRef,useState} from "react";
import {Download,X,Square,FolderOpen} from "lucide-react";
import {novelFetch,novelRequest} from "@/lib/novel/client";
import {notifyNovelExport,type NovelAudioDownload} from "@/lib/novel/export-notices";
import type {NovelBook} from "@/lib/novel/types";
type ExportStatus={id:string;status:"running"|"done"|"cancelled"|"error";done:number;total:number;chapter:string;error:string;filename:string};
const button="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm disabled:opacity-40";
export function NovelAudioExport({book,chapterId,encoding,onClose}:{book:NovelBook;chapterId:string;encoding:string;onClose:()=>void}){
  const [selected,setSelected]=useState<string[]>([chapterId]),[voice,setVoice]=useState(book.preferences.voiceId),[job,setJob]=useState<ExportStatus|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [saving,setSaving]=useState(false),[savedPath,setSavedPath]=useState(""),[desktop,setDesktop]=useState(false);
  const mounted=useRef(true);
  const notified=useRef(new Set<string>()),pollError=useRef("");
  const dialog=useRef<HTMLElement>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{const previous=document.activeElement;dialog.current?.focus();return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[]);
  useEffect(()=>{setDesktop(!!window.rmDesktop?.onNovelAudioDownload);},[]);
  useEffect(()=>{
    if(!job||job.status==="running"||notified.current.has(job.id))return;
    notified.current.add(job.id);
    if(job.status==="done")notifyNovelExport({kind:"info",title:"语音生成成功",message:`${job.filename} · 尚未保存到所选位置`,key:job.id});
    if(job.status==="error")notifyNovelExport({kind:"error",title:"语音生成失败",message:job.error||"请重新生成。",key:job.id});
    if(job.status==="cancelled")notifyNovelExport({kind:"info",title:"已取消语音生成",message:book.title,key:job.id});
  },[job,book.title]);
  useEffect(()=>{const receive=(event:Event)=>{const download=(event as CustomEvent<NovelAudioDownload>).detail;if(download.id!==job?.id)return;setSaving(download.state==="started");if(download.state==="completed"){setSavedPath(download.path||"");setError("");}if(download.state==="interrupted")setError("语音保存失败，请重新保存。");};window.addEventListener("rm:novel-audio-download",receive);return()=>window.removeEventListener("rm:novel-audio-download",receive);},[job?.id]);
  const base=`/api/novel?profileId=${encodeURIComponent(book.profileId)}&itemId=${encodeURIComponent(book.itemId)}`;
  useEffect(()=>{
    if(job?.status!=="running")return;
    const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{const r=await novelFetch(`${base}&action=audio-export-status&id=${job.id}`,{signal:abort.signal}),data=await r.json();if(!r.ok)throw new Error(data.error);if(!abort.signal.aborted){setJob(data);pollError.current="";setError("");if(data.status==="running")timer=setTimeout(poll,750);}}catch(e){if(!abort.signal.aborted){const message=e instanceof Error?e.message:String(e);setError(message);if(pollError.current!==message){pollError.current=message;notifyNovelExport({kind:"error",title:"无法获取导出状态",message,key:job.id});}timer=setTimeout(poll,2000);}}};
    timer=setTimeout(poll,300);return()=>{abort.abort();clearTimeout(timer);};
  },[base,job?.id,job?.status]);
  const run=async(fn:()=>Promise<ExportStatus>)=>{setBusy(true);setError("");setSavedPath("");try{const value=await fn();if(mounted.current)setJob(value);}catch(e){const message=e instanceof Error?e.message:String(e);if(mounted.current)setError(message);notifyNovelExport({kind:"error",title:"语音导出失败",message});}finally{if(mounted.current)setBusy(false);}};
  const save=async()=>{
    if(!job||job.status!=="done")return;setBusy(true);setError("");setSavedPath("");
    try{
      const response=await novelFetch(`${base}&action=audio-export-status&id=${job.id}`),status=await response.json();if(!response.ok||status.status!=="done")throw new Error(status.error||"导出任务已失效，请重新生成。");
      const anchor=document.createElement("a");anchor.href=`${base}&action=audio-export-download&id=${job.id}`;anchor.download=job.filename;document.body.appendChild(anchor);anchor.click();anchor.remove();
      if(!desktop)notifyNovelExport({kind:"info",title:"已交给浏览器下载",message:"保存位置由浏览器管理，可在浏览器下载列表中打开所在文件夹。",key:job.id});
    }catch(e){const message=e instanceof Error?e.message:String(e);if(mounted.current){setSaving(false);setError(message);}notifyNovelExport({kind:"error",title:"语音保存失败",message,key:job.id});}
    finally{if(mounted.current)setBusy(false);}
  };
  const reveal=async()=>{try{if(!await window.rmDesktop?.revealItem?.(savedPath))throw new Error("文件已移动、删除或无法打开所在文件夹。");}catch(e){const message=e instanceof Error?e.message:String(e);setError(message);notifyNovelExport({kind:"error",title:"无法定位文件",message,key:job?.id});}};
  const running=job?.status==="running";
  const locked=running||busy||saving;
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key!=="Escape")return;e.preventDefault();e.stopImmediatePropagation();if(!locked)onClose();};window.addEventListener("keydown",key,true);return()=>window.removeEventListener("keydown",key,true);},[locked,onClose]);
  return <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/40 p-4" onClick={()=>{if(!locked)onClose();}}>
    <section data-novel-audio-export ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="导出小说语音" className="max-h-[85dvh] w-full max-w-lg overflow-auto rounded-lg bg-[var(--paper)] p-5 text-[var(--ink)] shadow-xl" onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
      <header className="mb-4 flex items-center justify-between gap-3"><h3 className="text-base font-semibold">导出小说语音</h3><button className={button} aria-label="关闭语音导出" disabled={locked} onClick={onClose}><X size={17}/></button></header>
      <p className="mb-3 truncate text-sm">{book.title}</p>
      <fieldset disabled={locked} className="space-y-3">
        <label className="flex items-center justify-between gap-3 text-sm">音色<select aria-label="导出音色" value={voice} onChange={e=>setVoice(+e.target.value)} className="rounded-md border bg-white p-2">{Array.from({length:100},(_,i)=><option key={i+3} value={i+3}>{i<55?`女声 ${i+1}`:`男声 ${i-54}`}</option>)}</select></label>
        <div className="flex items-center justify-between text-sm"><span>已保存章节 · {book.chapters.length}</span><label className="flex items-center gap-2"><input aria-label="选择全部章节" type="checkbox" checked={selected.length===book.chapters.length} onChange={e=>setSelected(e.target.checked?book.chapters.map(c=>c.id):[])}/>全选</label></div>
        <div className="max-h-52 overflow-auto border-y border-[var(--line)] py-1">{book.chapters.map((chapter,i)=><label key={chapter.id} className="flex items-center gap-3 py-2 text-sm"><input aria-label={chapter.title} type="checkbox" checked={selected.includes(chapter.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,chapter.id]:ids.filter(id=>id!==chapter.id))}/><span className="min-w-0 truncate" title={chapter.title}>{i+1}. {chapter.title}</span></label>)}</div>
      </fieldset>
      <p className="mt-3 text-xs text-[var(--ink-muted)]">本地 Kokoro · 原速 / 原始音量 · {selected.length===1?"WAV":"每章 WAV / ZIP"}</p>
      {job&&<div role="status" className="mt-3 space-y-2 text-sm"><p>{job.status==="running"?job.chapter:job.status==="done"?"导出完成":job.status==="cancelled"?"已取消":job.error}</p><progress className="w-full accent-[var(--accent)]" max={job.total||1} value={job.done}/><p>{job.done} / {job.total} 段</p></div>}
      {error&&<p role="alert" className="mt-3 break-words text-sm text-red-700">{error}</p>}
      {saving&&<p role="status" className="mt-3 text-sm">正在保存语音…</p>}
      {savedPath&&<div className="mt-3 border-t border-[var(--line)] pt-3 text-sm"><p>语音保存成功</p><p className="mt-1 break-all text-xs text-[var(--ink-muted)]">{savedPath}</p><button className={`${button} mt-2`} onClick={()=>void reveal()}><FolderOpen size={16}/>{window.rmDesktop?.platform==="darwin"?"在访达中显示":"在文件夹中显示"}</button></div>}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {running?<button className={button} disabled={busy} onClick={()=>void run(()=>novelRequest(book.profileId,"audio-export-cancel",{itemId:book.itemId,id:job.id}))}><Square size={15}/>取消生成</button>:<button className={button} disabled={locked||!selected.length} onClick={()=>void run(()=>novelRequest(book.profileId,"audio-export-start",{itemId:book.itemId,encoding,chapterIds:selected,voiceId:voice}))}><Download size={16}/>{busy?"正在准备…":"生成语音"}</button>}
        {job?.status==="done"&&<button className={button} disabled={busy||saving} onClick={()=>void save()}><Download size={16}/>{desktop?"保存":"下载"}{job.filename.endsWith(".zip")?" ZIP":" WAV"}</button>}
      </div>
    </section>
  </div>;
}
