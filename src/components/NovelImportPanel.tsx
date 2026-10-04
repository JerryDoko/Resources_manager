"use client";
import { useEffect, useRef, useState } from "react";
import { BookPlus, Download, FolderOpen, X } from "lucide-react";
import { novelRequest } from "@/lib/novel/client";
import { useLibrary } from "@/lib/store";
import { openNovel } from "@/lib/novel/open-reader";
import { NovelVoiceInstaller } from "./NovelVoiceInstaller";
import { NovelVoicePerformance } from "./NovelVoicePerformance";
type Preview={token:string;books:{title:string;chapters:number}[];totalChapters:number};
export function NovelImportPanel({inline=false}:{inline?:boolean}){
  const {refresh}=useLibrary();
  const [open,setOpen]=useState(false),[profile,setProfile]=useState(""),[url,setUrl]=useState(""),[directory,setDirectory]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[preview,setPreview]=useState<Preview|null>(null);
  const [localPath,setLocalPath]=useState("");
  const [runtime,setRuntime]=useState(false);
  const [runtimeModel,setRuntimeModel]=useState("");
  const [desktop,setDesktop]=useState(false);
  const upload=useRef<HTMLInputElement>(null);
  const loadContext=async()=>{const r=await fetch("/api/novel?action=context"),d=await r.json();if(!r.ok)throw new Error(d.error);setProfile(d.profileId);setRuntime(d.available);setRuntimeModel(d.model||"");};
  useEffect(()=>{setDesktop(!!window.rmDesktop?.chooseNovel);if(inline)void loadContext().catch(e=>setMessage(e instanceof Error?e.message:String(e)));},[inline]);
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage("");try{await fn();}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const show=()=>{setOpen(true);void run(loadContext);};
  const importWeb=(listen:boolean)=>void run(async()=>{const result=await novelRequest<{itemId:string}>(profile,"web",{url});await refresh();setMessage("已导入当前章节，后续章节将在朗读时自动保存");if(listen){setOpen(false);openNovel({itemId:result.itemId,title:"网页小说"});}});
  const imported=async()=>{await refresh();setOpen(false);setMessage("已导入到当前工作区");};
  const localImport=()=>{if(!desktop&&!localPath.trim()){upload.current?.click();return;}void run(async()=>{const file=desktop?await window.rmDesktop!.chooseNovel!():localPath.trim();if(!file)return;await novelRequest(profile,"local-import",{file});await imported();});};
  const uploadFile=(file:File)=>void run(async()=>{if(file.size>80*1024*1024)throw new Error("小说文件不能超过 80 MB");const form=new FormData();form.set("profileId",profile);form.set("file",file);const r=await fetch(`/api/novel?profileId=${encodeURIComponent(profile)}`,{method:"POST",body:form}),d=await r.json();if(!r.ok)throw new Error(d.error||"导入失败");await imported();});
  const chooseLegacy=()=>void run(async()=>{const dir=await window.rmDesktop?.chooseFolder?.("选择听页 Books 目录")||directory;if(!dir)throw new Error("请选择包含 catalog.json 的 Books 目录");setDirectory(dir);setPreview(await novelRequest<Preview>(profile,"legacy-preview",{directory:dir}));});
  const button="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm disabled:opacity-40";
  return <>
    {!inline&&<button className={button} onClick={show}><BookPlus size={17}/>小说导入</button>}
    {(inline||open)&&<div className={inline?"border-y border-[var(--line)] bg-[var(--paper)] px-4 py-5":"fixed inset-0 z-[260] flex items-center justify-center bg-black/35 p-4"} onClick={()=>{if(!inline&&!busy)setOpen(false);}}><section role={inline?undefined:"dialog"} aria-modal={inline?undefined:true} aria-label="小说导入" className={inline?"w-full":"max-h-[90dvh] w-full max-w-xl overflow-auto rounded-lg bg-[var(--paper)] p-5 shadow-xl"} onClick={e=>e.stopPropagation()}>
      {!inline&&
      <header className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">小说导入</h2><button aria-label="关闭导入" disabled={busy} onClick={()=>setOpen(false)}><X size={20}/></button></header>
      }
      <fieldset disabled={busy||!profile} className="space-y-5 disabled:opacity-60">
        <div className="flex flex-wrap items-center gap-3"><h3 className="mr-auto text-sm font-medium">本地文件</h3><input ref={upload} type="file" accept=".txt,.epub" aria-label="选择本地小说文件" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(file)uploadFile(file);e.target.value="";}}/><button className={button} onClick={localImport}><FolderOpen size={16}/>导入 TXT / EPUB</button></div>
        {!desktop&&<details className="text-xs text-[var(--ink-muted)]"><summary className="cursor-pointer">通过本机路径导入</summary><input aria-label="本地小说路径" value={localPath} onChange={e=>setLocalPath(e.target.value)} placeholder="TXT / EPUB 文件路径" className="mt-2 w-full rounded-lg border p-2"/></details>}
        <div className="space-y-2"><label className="block text-sm font-medium" htmlFor={inline?"novel-inline-url":"novel-url"}>从网页导入</label><div className="flex flex-wrap gap-2"><input id={inline?"novel-inline-url":"novel-url"} type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…" className="min-w-0 flex-1 basis-56 rounded-lg border p-2"/><button className={button} disabled={!url.trim()} onClick={()=>importWeb(false)}>导入网页</button><button className={button} disabled={!url.trim()} onClick={()=>importWeb(true)}>导入并阅读</button></div></div>
        <details className="border-t border-[var(--line)] pt-4"><summary className="cursor-pointer text-sm font-medium">旧书迁入与备份</summary><div className="mt-3 space-y-4">
        <div className="space-y-2 border-t border-[var(--line)] pt-4"><h3 className="text-sm font-medium">迁入听页书库</h3><input aria-label="听页 Books 目录" value={directory} onChange={e=>{setDirectory(e.target.value);setPreview(null);}} placeholder="听页 Books 目录" className="w-full rounded-lg border p-2"/><button className={button} onClick={chooseLegacy}><FolderOpen size={16}/>选择目录并预览</button>
          {preview&&<div className="space-y-2 text-sm"><p>{preview.books.length} 本 · {preview.totalChapters} 章</p><ul className="max-h-32 overflow-auto">{preview.books.map((b,i)=><li key={i} className="truncate">{b.title} · {b.chapters} 章</li>)}</ul><button className={button} onClick={()=>void run(async()=>{const d=await novelRequest<{created:number;reused:number}>(profile,"legacy-import",{token:preview.token});await refresh();setMessage(`新增 ${d.created} 本，已有 ${d.reused} 本；原书库未修改`);setPreview(null);})}>确认复制到当前工作区</button></div>}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4"><a className={button} href={`/api/novel?action=export&profileId=${encodeURIComponent(profile)}`} download><Download size={16}/>导出托管小说</a><label className={`${button} cursor-pointer`}>恢复托管小说<input className="hidden" type="file" accept="application/json,.json" onChange={e=>{const file=e.target.files?.[0];if(file)void run(async()=>{if(file.size>80*1024*1024)throw new Error("导出文件超过 80 MB");await novelRequest(profile,"restore",{archive:JSON.parse(await file.text())});await refresh();setMessage("书籍已恢复，已有书籍未覆盖");});e.target.value="";}}/></label></div>
        </div></details>
        <NovelVoiceInstaller profileId={profile} available={runtime} installedModel={runtimeModel} onInstalled={loadContext}/>
        <NovelVoicePerformance profileId={profile}/>
      </fieldset>
      {(busy||message)&&<p role="status" className="mt-4 break-words text-sm text-[var(--ink-muted)]">{message||(busy?"正在处理…":"")}</p>}
    </section></div>}
  </>;
}
