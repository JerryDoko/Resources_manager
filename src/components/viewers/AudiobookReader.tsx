"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, List, X, PictureInPicture2, Maximize2, Headphones, BookOpen } from "lucide-react";
import { FullscreenPortal } from "./FullscreenPortal";
import { NovelPlaybackControls } from "./NovelPlaybackControls";
import { useAppChrome } from "@/lib/useAppChrome";
import { useNovelPlayback } from "@/lib/novel/useNovelPlayback";
import { NOVEL_ENCODINGS } from "@/lib/encoding-types";
import { DEFAULT_PREFERENCES } from "@/lib/novel/types";

interface Props { itemId:string; title:string; onClose:()=>void;chapterId?:string }
const button="rounded-lg border border-[var(--line)] p-2 disabled:opacity-40 hover:bg-black/5";
export function AudiobookReader(props:Props) {
  const [context,setContext]=useState<{profileId:string;available:boolean}|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{const abort=new AbortController();fetch("/api/novel?action=context",{signal:abort.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setContext(d);}).catch(e=>{if(!abort.signal.aborted)setError(String(e));});return()=>abort.abort();},[]);
  if(!context)return <FullscreenPortal className="fixed inset-0 z-[300] bg-[var(--paper)] p-8" style={{backgroundColor:"#fafbf9"}}><button className={button} onClick={props.onClose} aria-label="关闭"><X/></button><p>{error||"加载小说…"}</p></FullscreenPortal>;
  return <Reader key={`${context.profileId}:${props.itemId}`} {...props} {...context}/>;
}
function Reader({profileId,available,itemId,title,onClose,chapterId}:Props&{profileId:string;available:boolean}) {
  const [encoding,setEncoding]=useState("auto"),[fontSize,setFontSize]=useState(18),[toc,setToc]=useState(false);
  const [listening,setListening]=useState(false);
  const {controller,state}=useNovelPlayback(profileId,itemId,encoding);
  const {showTitlebarChrome}=useAppChrome();
  const [floating,setFloating]=useState<Window|null>(null),[floatingRoot,setFloatingRoot]=useState<HTMLElement|null>(null);
  const floatingRef=useRef<Window|null>(null),closingFloating=useRef(false),requestedChapter=useRef<string|undefined>(undefined);
  const popupCleanup=useRef<()=>void>(()=>{});
  const {book,chapter,index}=state,prefs=book?.preferences||DEFAULT_PREFERENCES;
  const content=useRef<HTMLDivElement>(null),frame=useRef<HTMLIFrameElement>(null),cleanup=useRef<()=>void>(()=>{});
  useEffect(()=>{if(state.book&&chapterId&&requestedChapter.current!==chapterId){requestedChapter.current=chapterId;void controller.seek(chapterId);}},[state.book,chapterId,controller]);
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
  const switchChapter=useCallback((delta:number)=>{if(Date.now()-cooldown.current<900)return;cooldown.current=Date.now();boundary.current=0;void controller.changeChapter(delta);},[controller]);
  const highlight=useCallback(()=>{
    const current=controller.state,chunk=current.chapter?.chunks[current.index],doc=frame.current?.contentDocument;
    if(doc){doc.querySelectorAll("[data-novel-active]").forEach(el=>el.removeAttribute("data-novel-active"));const el=listening&&chunk?.block?doc.querySelector(`[data-novel-block="${chunk.block}"]`):null;if(el){el.setAttribute("data-novel-active","true");if(current.playing&&current.book?.preferences.follow)el.scrollIntoView({block:"center",behavior:"smooth"});}}
    else if(listening&&current.playing&&current.book?.preferences.follow)content.current?.querySelector(`[data-chunk-index="${current.index}"]`)?.scrollIntoView({block:"center",behavior:"smooth"});
  },[controller,listening]);
  useEffect(()=>{highlight();},[highlight,index,chapter?.id,prefs.follow,state.playing]);
  useEffect(()=>()=>cleanup.current(),[]);
  const attachFrame=()=>{
    cleanup.current();const doc=frame.current?.contentDocument,win=frame.current?.contentWindow;if(!doc||!win)return;
    const style=doc.createElement("style");style.textContent=`body{font-size:${fontSize}px!important} [data-novel-active]{background:#d6eee8!important;outline:2px solid #438c7e!important} [data-novel-block]{cursor:pointer}`;doc.head.append(style);
    const click=(e:MouseEvent)=>{const el=(e.target as Element).closest?.("[data-novel-block]");const i=controller.state.chapter?.chunks.findIndex(c=>c.block===el?.getAttribute("data-novel-block"))??-1;if(i>=0)void controller.seek(controller.state.chapter!.id,i);};
    const wheel=(e:WheelEvent)=>{const el=doc.scrollingElement!;const edge=e.deltaY>0?el.scrollTop+win.innerHeight>=el.scrollHeight-3:el.scrollTop<=2;if(!edge){boundary.current=0;return;}boundary.current+=e.deltaY;if(Math.abs(boundary.current)>180){e.preventDefault();switchChapter(Math.sign(boundary.current));}};
    const start=(e:TouchEvent)=>{touch.current=e.touches[0]?.clientY??null;};
    const end=(e:TouchEvent)=>{const y=e.changedTouches[0]?.clientY;if(touch.current==null||y==null)return;const delta=touch.current-y,el=doc.scrollingElement!;if(Math.abs(delta)>100&&(delta>0?el.scrollTop+win.innerHeight>=el.scrollHeight-3:el.scrollTop<=2))switchChapter(Math.sign(delta));touch.current=null;};
    doc.addEventListener("click",click);win.addEventListener("wheel",wheel,{passive:false});win.addEventListener("touchstart",start);win.addEventListener("touchend",end);
    cleanup.current=()=>{doc.removeEventListener("click",click);win.removeEventListener("wheel",wheel);win.removeEventListener("touchstart",start);win.removeEventListener("touchend",end);};highlight();
  };
  useEffect(()=>{const doc=frame.current?.contentDocument;if(doc?.body)doc.body.style.setProperty("font-size",`${fontSize}px`,"important");},[fontSize]);
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.target instanceof Element&&e.target.closest("input,select,textarea,button"))return;if(e.code==="Space"&&listening){e.preventDefault();void (controller.state.playing?controller.pause():controller.play());}if(e.key==="ArrowLeft")switchChapter(-1);if(e.key==="ArrowRight")switchChapter(1);};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[controller,switchChapter,listening]);
  const close=()=>{closingFloating.current=true;floatingRef.current?.close();controller.close();onClose();window.dispatchEvent(new Event("rm:novel-library-changed"));};
  if(floating&&floatingRoot)return createPortal(<div className="flex min-h-dvh flex-col bg-[#fafbf9] text-[var(--ink)]">
    <header className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2" style={{WebkitAppRegion:"drag"} as React.CSSProperties}><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{book?.title||title}</p><p className="truncate text-[11px] text-[var(--ink-muted)]">{chapter?.title}</p></div><div className="flex gap-1" style={{WebkitAppRegion:"no-drag"} as React.CSSProperties}><button className={button} aria-label="展开阅读器" title="展开阅读器" onClick={restore}><Maximize2 size={15}/></button><button className={button} aria-label="关闭悬浮播放器" title="关闭" onClick={close}><X size={15}/></button></div></header>
    <p className="min-h-0 flex-1 overflow-auto px-4 py-3 text-sm leading-relaxed">{chapter?.chunks[index]?.text}</p>
    {(state.error||state.notice)&&<p className="px-4 text-xs text-amber-800">{state.error||state.notice}</p>}
    <div className="px-3 pb-3"><NovelPlaybackControls compact controller={controller} state={state} onSettingsChange={open=>floating.resizeTo(460,open?400:240)}/></div>
  </div>,floatingRoot);
  return <FullscreenPortal className="fixed inset-0 z-[300] flex flex-col bg-[#f4f0e6] text-[#2a2418]" style={{backgroundColor:"#f4f0e6"}}>
    <header className={`flex flex-wrap items-center gap-3 border-b border-[#e5dfd2] px-4 py-3 ${showTitlebarChrome?"pl-[90px]":""}`}>
      <button title="目录" aria-label="目录" className={button} onClick={()=>setToc(!toc)}><List size={18}/></button>
      <div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{book?.title||title}</h2><p className="truncate text-xs text-[#756c5b]">{chapter?.title} · {Math.min(index+1,chapter?.chunks.length||0)} / {chapter?.chunks.length||0} 段</p></div>
      {book?.format==="txt"&&<select aria-label="文本编码" value={encoding} onChange={e=>setEncoding(e.target.value)} className="max-w-40 rounded-lg border p-2 text-sm"><option value="auto">自动编码{book.encoding?` · ${book.encoding}`:""}</option>{NOVEL_ENCODINGS.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select>}
      <label className="flex items-center gap-2 text-xs">字号<input aria-label="字号" type="range" min={14} max={28} value={fontSize} onChange={e=>setFontSize(+e.target.value)} className="w-20"/></label>
      <button title="上一章" aria-label="上一章" className={button} onClick={()=>switchChapter(-1)}><ChevronLeft size={18}/></button>
      <button title="下一章" aria-label="下一章" className={button} onClick={()=>switchChapter(1)}><ChevronRight size={18}/></button>
      <button title={listening?"切换到阅读":"听书"} aria-label={listening?"切换到阅读":"听书"} aria-pressed={listening} className={`${button} inline-flex items-center gap-2 text-sm`} onClick={()=>{if(listening)void controller.pause();setListening(!listening);}}>{listening?<BookOpen size={18}/>:<Headphones size={18}/>}<span>{listening?"阅读":"听书"}</span></button>
      {listening&&<button title="悬浮播放器" aria-label="悬浮播放器" className={button} onClick={popout}><PictureInPicture2 size={18}/></button>}
      <button title="关闭" aria-label="关闭小说" className={button} onClick={close}><X size={18}/></button>
    </header>
    <div className="flex min-h-0 flex-1">
      {toc&&<aside className="w-52 max-w-[42%] shrink-0 overflow-auto border-r border-[#e5dfd2]">{book?.chapters.map(ch=><button key={ch.id} onClick={()=>{void controller.seek(ch.id);if(window.innerWidth<768)setToc(false);}} className={`block w-full truncate p-3 text-left text-sm ${ch.id===chapter?.id?"bg-[#d6eee8]":"hover:bg-black/5"}`} title={ch.title}>{ch.title}</button>)}</aside>}
      {chapter?.html?<iframe key={chapter.id} ref={frame} title={chapter.title} srcDoc={chapter.html} onLoad={attachFrame} sandbox="allow-same-origin" className="min-w-0 flex-1 border-0"/>:
        <div ref={content} className="min-w-0 flex-1 overflow-auto p-5 md:p-10" style={{fontSize}}><article className="mx-auto max-w-3xl whitespace-pre-wrap leading-loose">{chapter?.chunks.map((chunk,i)=><span key={chunk.id}>{chapter.text.slice(i?chapter.chunks[i-1].end:0,chunk.start)}<span role={listening?"button":undefined} tabIndex={listening?0:undefined} data-chunk-index={i} onClick={()=>{if(listening)void controller.seek(chapter.id,i);}} onKeyDown={e=>{if(listening&&e.key==="Enter")void controller.seek(chapter.id,i);}} className={listening?`cursor-pointer rounded-sm ${i===index?"bg-[#d6eee8] outline outline-1 outline-[#438c7e]":"hover:bg-black/5"}`:""}>{chunk.text}</span>{i===chapter.chunks.length-1?chapter.text.slice(chunk.end):""}</span>)}</article></div>}
    </div>
    {!listening&&(state.error||state.notice)&&<p role="status" className="px-4 py-2 text-sm text-amber-800">{state.error||state.notice}</p>}
    {listening&&<footer className="shrink-0 border-t border-[#e5dfd2] bg-[#faf8f2] px-4 py-3">
      {(state.error||state.notice||!available)&&<p role="status" className="mb-2 text-sm text-amber-800">{state.error||state.notice||"本地声音包未安装，可在小说导入中安装或选择系统语音。"}</p>}
      <div className="mx-auto max-w-4xl"><NovelPlaybackControls controller={controller} state={state}/></div>
      {state.nextReady&&<p className="mx-auto mt-1 max-w-4xl text-[11px] text-[#756c5b]">{state.nextReady}</p>}
    </footer>}
  </FullscreenPortal>;
}
