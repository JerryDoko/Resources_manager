"use client";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, Check, Search } from "lucide-react";
import { novelRequest } from "@/lib/novel/client";
import { openNovel } from "@/lib/novel/open-reader";
interface ChapterSummary {id:string;title:string;order:number;characters:number;segments:number;progress:number;current:boolean}
interface Summary {itemId:string;title:string;chapters:ChapterSummary[];position:{chapterId:string}|null}
export function NovelChapterList({itemId,title,onCount}:{itemId:string;title:string;onCount?:(count:number)=>void}) {
  const [data,setData]=useState<Summary|null>(null),[search,setSearch]=useState(""),[error,setError]=useState("");
  const load=useCallback(async(signal?:AbortSignal)=>{
    try{const c=await fetch("/api/novel?action=context",{signal}).then(r=>r.json());const data=await novelRequest<Summary>(c.profileId,"chapters-summary",{itemId},signal);setData(data);onCount?.(data.chapters.length);setError("");}catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:String(e));}
  },[itemId,onCount]);
  useEffect(()=>{const abort=new AbortController();void load(abort.signal);const changed=()=>void load(abort.signal);window.addEventListener("rm:novel-library-changed",changed);const timer=setInterval(()=>{if(!document.hidden)void load(abort.signal);},10000);return()=>{abort.abort();clearInterval(timer);window.removeEventListener("rm:novel-library-changed",changed);};},[load]);
  const chapters=data?.chapters.filter(ch=>ch.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))||[];
  return <section className="space-y-3" aria-label="小说章节">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">章节列表 · {data?.chapters.length??"…"} 章</h2><button onClick={()=>openNovel({itemId,title})} className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs"><BookOpen size={15}/>{data?.position?"继续阅读":"打开书本"}</button></div>
    <label className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3"><Search size={16} className="text-[var(--ink-faint)]"/><input aria-label="搜索章节" value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索章节名称" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"/></label>
    {error&&<p className="text-sm text-red-700">{error}</p>}
    <ol className="overflow-hidden rounded-lg border border-[var(--line)] bg-white divide-y divide-[var(--line)]">{chapters.map(ch=><li key={ch.id}><button aria-label={`打开章节 ${ch.title}`} onClick={()=>openNovel({itemId,title,chapterId:ch.id})} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--accent-soft)]/40"><span className="w-7 shrink-0 text-xs tabular-nums text-[var(--ink-faint)]">{ch.order}</span><BookOpen size={17} className="shrink-0 text-[var(--accent)]"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{ch.title}</p><p className="mt-1 text-xs text-[var(--ink-faint)]">{ch.characters.toLocaleString()} 字 · {ch.segments} 段{ch.current?" · 续听位置":""}</p></div><span className="flex shrink-0 items-center gap-1 text-xs text-[var(--ink-muted)]">{ch.progress>=1?<><Check size={14}/>已读完</>:ch.progress>0?`已读 ${Math.round(ch.progress*100)}%`:"未读"}</span></button></li>)}{!chapters.length&&data&&<li className="p-5 text-center text-sm text-[var(--ink-faint)]">没有符合条件的章节</li>}</ol>
  </section>;
}
