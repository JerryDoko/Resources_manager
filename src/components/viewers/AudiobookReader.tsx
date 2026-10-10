"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, List, X, PictureInPicture2, Maximize2, Headphones, BookOpen, Download, MessageSquare, LoaderCircle, FolderOpen } from "lucide-react";
import {NovelAudioExport} from "./NovelAudioExport";
import { FullscreenPortal } from "./FullscreenPortal";
import { NovelPlaybackControls } from "./NovelPlaybackControls";
import { useAppChrome } from "@/lib/useAppChrome";
import { useNovelPlayback } from "@/lib/novel/useNovelPlayback";
import { NOVEL_ENCODINGS } from "@/lib/encoding-types";
import { DEFAULT_PREFERENCES } from "@/lib/novel/types";
import { revealLocalFile } from "@/lib/reveal-file";

interface Props { itemId:string; title:string; onClose:()=>void;chapterId?:string }
const button="rounded-lg border border-[var(--line)] p-2 disabled:opacity-40 hover:bg-black/5";
export function AudiobookReader(props:Props) {
  const [context,setContext]=useState<{profileId:string;available:boolean}|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{const abort=new AbortController();fetch("/api/novel?action=context",{signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setContext(d);}).catch(e=>{if(!abort.signal.aborted)setError(String(e));});return()=>abort.abort();},[]);
  if(!context)return <FullscreenPortal className="fixed inset-0 z-[300] bg-[var(--paper)] p-8"><button className={button} onClick={props.onClose} aria-label="关闭"><X/></button><p>{error||"加载小说…"}</p></FullscreenPortal>;
  return <Reader key={`${context.profileId}:${props.itemId}`} {...props} {...context}/>;
}
function Reader({profileId,available,itemId,title,onClose,chapterId}:Props&{profileId:string;available:boolean}) {
  const [encoding,setEncoding]=useState("auto"),[fontSize,setFontSize]=useState(18),[toc,setToc]=useState(false);
  const [listening,setListening]=useState(false);
  const [exporting,setExporting]=useState(false);
  const [commentsOpen,setCommentsOpen]=useState(false);
  const {controller,state}=useNovelPlayback(profileId,itemId,encoding,chapterId);
  const {showTitlebarChrome}=useAppChrome();
  const [floating,setFloating]=useState<Window|null>(null),[floatingRoot,setFloatingRoot]=useState<HTMLElement|null>(null);
  const floatingRef=useRef<Window|null>(null),closingFloating=useRef(false);
  const popupCleanup=useRef<()=>void>(()=>{});
  const {book,chapter,index}=state,prefs=book?.preferences||DEFAULT_PREFERENCES;
  useEffect(()=>setCommentsOpen(false),[chapter?.id]);
  const content=useRef<HTMLDivElement>(null),frame=useRef<HTMLIFrameElement>(null),cleanup=useRef<()=>void>(()=>{});
  const listeningRef=useRef(listening),ignoreScrollUntil=useRef(0);
  listeningRef.current=listening;
  useEffect(()=>()=>{popupCleanup.current();closingFloating.current=true;floatingRef.current?.close();},[]);
  useEffect(()=>{
    if(!floating)return;
    const timer=setInterval(()=>{if(floating.closed&&!closingFloating.current){setFloating(null);setFloatingRoot(null);controller.close();onClose();}},250);
    return()=>clearInterval(timer);
  },[floating,controller,onClose]);
  const popout=()=>{
    popupCleanup.current();
    const win=window.open("/novel-floating","rm-novel-floating","popup=yes,width=460,height=240");
    if(!win){controller.set({error:"悬浮窗口被阻止，请允许此应用打开窗口"});return;}
    closingFloating.current=false;floatingRef.current=win;
    const ready=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin||event.source!==win||event.data?.type!=="rm-novel-floating-ready"||win.closed)return;
      popupCleanup.current();
      win.document.title=book?.title||title;
      for(const style of document.querySelectorAll('link[rel="stylesheet"],style'))win.document.head.appendChild(style.cloneNode(true));
      const root=win.document.getElementById("novel-floating-host");if(!root)return;
      win.document.body.style.background="#fafbf9";setFloating(win);setFloatingRoot(root);
    };
    window.addEventListener("message",ready);
    const timeout=setTimeout(()=>{popupCleanup.current();if(!win.closed){closingFloating.current=true;win.close();controller.set({error:"悬浮窗口初始化超时，请重试"});}},30000);
    popupCleanup.current=()=>{window.removeEventListener("message",ready);clearTimeout(timeout);};
  };
  const restore=()=>{closingFloating.current=true;floatingRef.current?.close();floatingRef.current=null;setFloating(null);setFloatingRoot(null);};
  const cooldown=useRef(0),boundary=useRef(0),touch=useRef<number|null>(null);
  const switchChapter=useCallback((delta:number,gesture=false)=>{if(controller.state.chapterLoading||(gesture&&Date.now()-cooldown.current<900))return;cooldown.current=Date.now();boundary.current=0;void controller.changeChapter(delta);},[controller]);
  const highlight=useCallback((locate=false)=>{
    const current=controller.state,chunk=current.chapter?.chunks[current.index],doc=frame.current?.contentDocument;
    const el=doc&&chunk?.block?doc.querySelector(`[data-novel-block="${chunk.block}"]`):content.current?.querySelector(`[data-chunk-index="${current.index}"]`);
    if(doc){doc.querySelectorAll("[data-novel-active]").forEach(node=>node.removeAttribute("data-novel-active"));if(listeningRef.current)el?.setAttribute("data-novel-active","true");}
    if(el&&(locate||(listeningRef.current&&current.playing&&current.book?.preferences.follow))){ignoreScrollUntil.current=Date.now()+700;el.scrollIntoView({block:locate&&current.index===0?"start":"center",behavior:locate?"instant":"smooth"});}
  },[controller]);
  useEffect(()=>{highlight();},[highlight,index,chapter?.id,prefs.follow,state.playing,listening,floatingRoot]);
  useEffect(()=>{if(!floatingRoot)highlight(true);},[highlight,state.locationVersion,chapter?.id,listening,floatingRoot]);
  const trackReading=useCallback(()=>{
    if(listeningRef.current||Date.now()<ignoreScrollUntil.current)return;
    const doc=frame.current?.contentDocument,container=content.current,current=controller.state;
    if(!current.chapter)return;
    const top=doc?0:container?.getBoundingClientRect().top??0;
    const nodes=doc?.querySelectorAll<HTMLElement>("[data-novel-block]")||container?.querySelectorAll<HTMLElement>("[data-chunk-index]");
    const el=nodes&&Array.from(nodes).find(node=>node.getBoundingClientRect().bottom>top+60);
    if(!el)return;
    const next=doc?current.chapter.chunks.findIndex(c=>c.block===el.dataset.novelBlock):Number(el.dataset.chunkIndex);
    if(next>=0)controller.readAt(next);
  },[controller]);
  useEffect(()=>{
    const container=content.current;if(!container)return;
    let timer:ReturnType<typeof setTimeout>;
    const scroll=()=>{clearTimeout(timer);timer=setTimeout(trackReading,180);};
    container.addEventListener("scroll",scroll);return()=>{clearTimeout(timer);container.removeEventListener("scroll",scroll);};
  },[trackReading,chapter?.id,floatingRoot]);
  useEffect(()=>()=>cleanup.current(),[]);
  const attachFrame=()=>{
    cleanup.current();const doc=frame.current?.contentDocument,win=frame.current?.contentWindow;if(!doc||!win)return;
    const style=doc.createElement("style");style.textContent=`body{font-size:${fontSize}px!important} [data-novel-active]{background:#d6eee8!important;outline:2px solid #438c7e!important} [data-novel-block]{cursor:pointer}`;doc.head.append(style);
    const click=(e:MouseEvent)=>{if(!listeningRef.current||controller.state.chapterLoading)return;const el=(e.target as Element).closest?.("[data-novel-block]");const i=controller.state.chapter?.chunks.findIndex(c=>c.block===el?.getAttribute("data-novel-block"))??-1;if(i>=0)void controller.seek(controller.state.chapter!.id,i);};
    let scrollTimer:ReturnType<typeof setTimeout>;const scroll=()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(trackReading,180);};
    const wheel=(e:WheelEvent)=>{const el=doc.scrollingElement!;const edge=e.deltaY>0?el.scrollTop+win.innerHeight>=el.scrollHeight-3:el.scrollTop<=2;if(!edge){boundary.current=0;return;}boundary.current+=e.deltaY;if(Math.abs(boundary.current)>180){e.preventDefault();switchChapter(Math.sign(boundary.current),true);}};
    const start=(e:TouchEvent)=>{touch.current=e.touches[0]?.clientY??null;};
    const end=(e:TouchEvent)=>{const y=e.changedTouches[0]?.clientY;if(touch.current==null||y==null)return;const delta=touch.current-y,el=doc.scrollingElement!;if(Math.abs(delta)>100&&(delta>0?el.scrollTop+win.innerHeight>=el.scrollHeight-3:el.scrollTop<=2))switchChapter(Math.sign(delta),true);touch.current=null;};
    doc.addEventListener("click",click);win.addEventListener("scroll",scroll);win.addEventListener("wheel",wheel,{passive:false});win.addEventListener("touchstart",start);win.addEventListener("touchend",end);
    cleanup.current=()=>{clearTimeout(scrollTimer);doc.removeEventListener("click",click);win.removeEventListener("scroll",scroll);win.removeEventListener("wheel",wheel);win.removeEventListener("touchstart",start);win.removeEventListener("touchend",end);};highlight(true);
  };
  useEffect(()=>{const doc=frame.current?.contentDocument;if(doc?.body)doc.body.style.setProperty("font-size",`${fontSize}px`,"important");},[fontSize]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(controller.state.chapterLoading||e.target instanceof Element&&e.target.closest("input,select,textarea,button"))return;if(e.code==="Space"&&listening){e.preventDefault();void (controller.state.playing?controller.pause():controller.play());}if(e.key==="ArrowLeft")switchChapter(-1);if(e.key==="ArrowRight")switchChapter(1);};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[controller,switchChapter,listening]);
  const close=()=>{closingFloating.current=true;floatingRef.current?.close();controller.close();onClose();window.dispatchEvent(new Event("rm:novel-library-changed"));};
  const reveal=async()=>{try{if(!book?.storagePath)throw new Error("未找到小说存储路径");await revealLocalFile(book.storagePath);}catch(e){controller.set({error:e instanceof Error?e.message:String(e)});}};
  if(floating&&floatingRoot)return createPortal(<div className="flex min-h-dvh flex-col bg-[#fafbf9] text-[var(--ink)]">
    <header className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2" style={{WebkitAppRegion:"drag"} as React.CSSProperties}><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{book?.title||title}</p><p className="truncate text-[11px] text-[var(--ink-muted)]">{chapter?.title}</p></div><div className="flex gap-1" style={{WebkitAppRegion:"no-drag"} as React.CSSProperties}><button className={button} aria-label="展开阅读器" title="展开阅读器" onClick={restore}><Maximize2 size={15}/></button><button className={button} aria-label="关闭悬浮播放器" title="关闭" onClick={close}><X size={15}/></button></div></header>
    <p className="min-h-0 flex-1 overflow-auto px-4 py-3 text-sm leading-relaxed">{chapter?.chunks[index]?.text}</p>
    {(state.error||state.notice)&&<p className="px-4 text-xs text-amber-800">{state.error||state.notice}</p>}
    <div className="px-3 pb-3"><NovelPlaybackControls compact controller={controller} state={state} onSettingsChange={open=>floating.resizeTo(460,open?400:240)}/></div>
  </div>,floatingRoot);
  return <FullscreenPortal className="fixed inset-0 z-[300] flex flex-col bg-[#f4f0e6] text-[#2a2418]">
    <header className={`flex flex-wrap items-center gap-3 border-b border-[#e5dfd2] px-4 py-3 ${showTitlebarChrome?"pl-[90px]":""}`}>
      <button title="目录" aria-label="目录" className={button} onClick={()=>setToc(!toc)}><List size={18}/></button>
      <div className="min-w-36 flex-1"><h2 className="truncate font-semibold">{book?.title||title}</h2><p className="truncate text-xs text-[#756c5b]">{chapter?.title} · {Math.min(index+1,chapter?.chunks.length||0)} / {chapter?.chunks.length||0} 段</p></div>
      {book?.format==="txt"&&<select aria-label="文本编码" disabled={!!state.chapterLoading} value={encoding} onChange={e=>setEncoding(e.target.value)} className="max-w-40 rounded-lg border p-2 text-sm"><option value="auto">自动编码{book.encoding?` · ${book.encoding}`:""}</option>{NOVEL_ENCODINGS.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select>}
      <label className="flex items-center gap-2 text-xs">字号<input aria-label="字号" type="range" min={14} max={28} value={fontSize} onChange={e=>setFontSize(+e.target.value)} className="w-20"/></label>
      <button title={state.chapterLoading==="previous"?"正在加载上一章":"上一章"} aria-label="上一章" aria-busy={state.chapterLoading==="previous"} disabled={!!state.chapterLoading||!chapter} className={`${button} flex h-9 w-9 items-center justify-center`} onClick={()=>switchChapter(-1)}>{state.chapterLoading==="previous"?<LoaderCircle size={18} className="animate-spin"/>:<ChevronLeft size={18}/>}</button>
      <button title={state.chapterLoading==="next"?"正在加载下一章":"下一章"} aria-label="下一章" aria-busy={state.chapterLoading==="next"} disabled={!!state.chapterLoading||!chapter} className={`${button} flex h-9 w-9 items-center justify-center`} onClick={()=>switchChapter(1)}>{state.chapterLoading==="next"?<LoaderCircle size={18} className="animate-spin"/>:<ChevronRight size={18}/>}</button>
      <button title={listening?"切换到阅读":"听书"} aria-label={listening?"切换到阅读":"听书"} aria-pressed={listening} className={`${button} inline-flex items-center gap-2 text-sm`} onClick={()=>{if(listening)void controller.pause();setListening(!listening);}}>{listening?<BookOpen size={18}/>:<Headphones size={18}/>}<span>{listening?"阅读":"听书"}</span></button>
      {listening&&<button title="悬浮播放器" aria-label="悬浮播放器" className={button} onClick={popout}><PictureInPicture2 size={18}/></button>}
      <button title="导出小说语音" aria-label="导出小说语音" className={button} disabled={!book||!chapter} onClick={()=>setExporting(true)}><Download size={18}/></button>
      <button title="打开小说存储位置" aria-label="打开小说存储位置" className={button} disabled={!book?.storagePath} onClick={()=>void reveal()}><FolderOpen size={18}/></button>
      {chapter?.comments!==undefined&&<button title="章节评论" aria-label="章节评论" aria-pressed={commentsOpen} className={`${button} inline-flex items-center gap-2 text-sm`} onClick={()=>setCommentsOpen(!commentsOpen)}><MessageSquare size={18}/><span>{chapter.comments.length}</span></button>}
      <button title="关闭" aria-label="关闭小说" className={button} onClick={close}><X size={18}/></button>
    </header>
    {state.chapterLoading&&<p role="status" className="flex shrink-0 items-center gap-2 border-b border-[#e5dfd2] px-4 py-2 text-sm text-[#756c5b]"><LoaderCircle size={16} className="shrink-0 animate-spin"/>{state.chapterLoading==="next"?"正在加载下一章…":"正在加载上一章…"}</p>}
    <div className="flex min-h-0 flex-1" aria-busy={!!state.chapterLoading}>
      {toc&&<aside className="w-52 max-w-[42%] shrink-0 overflow-auto border-r border-[#e5dfd2]">{book?.chapters.map(ch=><button key={ch.id} disabled={!!state.chapterLoading} onClick={()=>{void controller.seek(ch.id);if(window.innerWidth<768)setToc(false);}} className={`block w-full truncate p-3 text-left text-sm ${ch.id===chapter?.id?"bg-[#d6eee8]":"hover:bg-black/5"}`} title={ch.title}>{ch.title}</button>)}</aside>}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col sm:flex-row">
      {chapter?.html?<iframe key={chapter.id} ref={frame} title={chapter.title} srcDoc={chapter.html} onLoad={attachFrame} sandbox="allow-same-origin" className="min-w-0 flex-1 border-0"/>:
        <div ref={content} className="min-h-0 min-w-0 flex-1 overflow-auto p-5 md:p-10" style={{fontSize}}><article className="mx-auto max-w-3xl whitespace-pre-wrap leading-loose">{chapter?.chunks.map((chunk,i)=><span key={chunk.id}>{chapter.text.slice(i?chapter.chunks[i-1].end:0,chunk.start)}<span role={listening?"button":undefined} tabIndex={listening?0:undefined} data-chunk-index={i} onClick={()=>{if(listening&&!controller.state.chapterLoading)void controller.seek(chapter.id,i);}} onKeyDown={e=>{if(listening&&!controller.state.chapterLoading&&e.key==="Enter")void controller.seek(chapter.id,i);}} className={listening?`cursor-pointer rounded-sm ${i===index?"bg-[#d6eee8] outline outline-1 outline-[#438c7e]":"hover:bg-black/5"}`:""}>{chunk.text}</span>{i===chapter.chunks.length-1?chapter.text.slice(chunk.end):""}</span>)}</article></div>}
      {commentsOpen&&<aside aria-label="章节评论列表" className="max-h-[40%] shrink-0 overflow-auto border-t border-[#e5dfd2] bg-[#faf8f2] px-4 py-3 sm:max-h-none sm:w-80 sm:max-w-[40%] sm:border-l sm:border-t-0"><header className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">评论 · {chapter?.comments?.length||0}</h3><button className={button} title="关闭评论" aria-label="关闭评论" onClick={()=>setCommentsOpen(false)}><X size={16}/></button></header>{!chapter?.comments?.length&&<p className="mt-4 text-sm text-[#756c5b]">本章暂无评论</p>}<ol className="mt-3 divide-y divide-[#e5dfd2]">{chapter?.comments?.map((text,i)=><li key={`${chapter.id}:${i}`} className="whitespace-pre-wrap break-words py-3 text-sm leading-relaxed">{text}</li>)}</ol></aside>}
      </div>
    </div>
    {!listening&&(state.error||state.notice)&&<p role="status" className="px-4 py-2 text-sm text-amber-800">{state.error||state.notice}</p>}
    {listening&&<footer className="shrink-0 border-t border-[#e5dfd2] bg-[#faf8f2] px-4 py-3">
      {(state.error||state.notice||!available)&&<p role="status" className="mb-2 text-sm text-amber-800">{state.error||state.notice||"本地声音包未安装，可在小说导入中安装或选择系统语音。"}</p>}
      <div className="mx-auto max-w-4xl"><NovelPlaybackControls controller={controller} state={state}/></div>
      {state.nextReady&&<p className="mx-auto mt-1 max-w-4xl text-[11px] text-[#756c5b]">{state.nextReady}</p>}
    </footer>}
    {exporting&&book&&chapter&&<NovelAudioExport book={book} chapterId={chapter.id} encoding={encoding} onClose={()=>setExporting(false)}/>}
  </FullscreenPortal>;
}
