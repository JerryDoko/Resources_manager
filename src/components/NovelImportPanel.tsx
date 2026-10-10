"use client";
import { useEffect, useRef, useState } from "react";
import { BookPlus, Download, ExternalLink, FolderOpen, RefreshCw, Upload, X } from "lucide-react";
import { NovelConnectionError, novelFetch, novelRequest } from "@/lib/novel/client";
import { useLibrary } from "@/lib/store";
import { openNovel } from "@/lib/novel/open-reader";
import { NovelPerformanceSettings } from "@/components/NovelPerformanceSettings";
import { NovelWebExtensionPanel } from "@/components/NovelWebExtensionPanel";
import { NovelHelpLink } from "@/components/NovelHelpLink";
import type { InstalledWebExtension } from "@/lib/novel/web-extensions";
import { subscribeExtensionChanges } from "@/lib/novel/extension-events";
type Preview={token:string;books:{title:string;chapters:number}[];totalChapters:number};
export function NovelImportPanel({inline=false}:{inline?:boolean}){
  const {refresh,refreshTags}=useLibrary();
  const [open,setOpen]=useState(false),[profile,setProfile]=useState(""),[url,setUrl]=useState(""),[directory,setDirectory]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[preview,setPreview]=useState<Preview|null>(null);
  const [localPath,setLocalPath]=useState("");
  const [runtime,setRuntime]=useState(false);
  const [engine,setEngine]=useState(false),[extensions,setExtensions]=useState<InstalledWebExtension[]>([]);
  const [voicePath,setVoicePath]=useState(""),[model,setModel]=useState("");
  const [desktop,setDesktop]=useState(false);
  const upload=useRef<HTMLInputElement>(null);
  const loadContext=async()=>{const r=await novelFetch("/api/novel?action=context"),d=await r.json();if(!r.ok)throw new Error(d.error);setProfile(d.profileId);setRuntime(d.available);setModel(d.model);setEngine(d.engineAvailable);setExtensions(d.webExtensions || []);};
  useEffect(()=>{setDesktop(!!window.rmDesktop?.chooseNovel);const reload=()=>void loadContext().catch(e=>setMessage(e instanceof Error?e.message:String(e)));if(inline)reload();window.addEventListener("focus",reload);const unsubscribe=subscribeExtensionChanges(reload);return()=>{window.removeEventListener("focus",reload);unsubscribe();};},[inline]);
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMessage("");try{await fn();}catch(e){if(e instanceof NovelConnectionError)setProfile("");setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const show=()=>{setOpen(true);void run(loadContext);};
  const importWeb=(listen:boolean)=>void run(async()=>{setMessage("正在读取网页；如需登录或验证，会弹出网页窗口。关闭网页窗口可取消导入。");const result=await novelRequest<{itemId:string;chapterIds:string[];title?:string;collectionPath?:string;notice?:string}>(profile,"web",{url});await refreshTags();await refresh();setMessage(`${result.notice||"已保存当前章节，后续章节将在阅读时自动保存"}${result.collectionPath?`\n本地文本：${result.collectionPath}`:""}`);if(listen){setOpen(false);openNovel({itemId:result.itemId,title:result.title||"网页小说",chapterId:result.chapterIds[0]});}});
  const imported=async()=>{await refresh();setOpen(false);setMessage("已导入到当前工作区");};
  const localImport=()=>{if(!desktop&&!localPath.trim()){upload.current?.click();return;}void run(async()=>{const file=desktop?await window.rmDesktop!.chooseNovel!():localPath.trim();if(!file)return;await novelRequest(profile,"local-import",{file});await imported();});};
  const uploadFile=(file:File)=>void run(async()=>{if(file.size>80*1024*1024)throw new Error("小说文件不能超过 80 MB");const form=new FormData();form.set("profileId",profile);form.set("file",file);const r=await novelFetch(`/api/novel?profileId=${encodeURIComponent(profile)}`,{method:"POST",body:form}),d=await r.json();if(!r.ok)throw new Error(d.error||"导入失败");await imported();});
  const chooseLegacy=()=>void run(async()=>{const dir=window.rmDesktop?.chooseFolder?await window.rmDesktop.chooseFolder("迁入旧书：选择包含 catalog.json 的 Books 目录"):directory;if(!dir)return;setDirectory(dir);setPreview(await novelRequest<Preview>(profile,"legacy-preview",{directory:dir}));});
  const install=(offline:boolean)=>void run(async()=>{
    const directory=offline?voicePath.trim():undefined;
    if(offline&&!directory)throw new Error("请选择或填写解压后的 Kokoro 模型目录");
    if(runtime&&!window.confirm("替换当前听书声音包？书籍和阅读进度保持不变，校验失败会保留原声音包。"))return;
    await novelRequest(profile,"install-runtime",{directory});
    for(;;){await new Promise(r=>setTimeout(r,500));const response=await novelFetch(`/api/novel?action=runtime-status&profileId=${encodeURIComponent(profile)}`);const p=await response.json();if(!response.ok)throw new Error(p.error);setMessage(`${p.phase}${p.total?` · ${Math.floor(p.done/p.total*100)}%`:""}`);if(p.error)throw new Error(p.error);if(!p.running)break;}
    await loadContext();setMessage("声音包安装完成 · 书籍与进度未修改");
  });
  const installEngine=()=>void run(async()=>{
    if(!window.confirm("从 PyPI 下载独立听书引擎？它包含 sherpa-onnx 及 eSpeak GPL 组件，按其各自许可证提供，不属于本项目 MIT 授权。安装包本身不携带此引擎。"))return;
    await novelRequest(profile,"install-engine",{confirmed:true});
    for(;;){await new Promise(r=>setTimeout(r,500));const r=await novelFetch(`/api/novel?action=runtime-status&profileId=${encodeURIComponent(profile)}`),p=await r.json();if(!r.ok)throw new Error(p.error);setMessage(p.phase);if(p.error)throw new Error(p.error);if(!p.running)break;}
    await loadContext();setMessage("听书引擎已安装，可以导入声音包");
  });
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
        <NovelWebExtensionPanel profile={profile} extensions={extensions} url={url} setUrl={setUrl} run={run} loadContext={loadContext} setMessage={setMessage} importWeb={importWeb} button={button}/>
        <details className="border-t border-[var(--line)] pt-4"><summary className="cursor-pointer text-sm font-medium">旧书迁入与备份</summary><div className="mt-3 space-y-4">
        <div className="space-y-2 border-t border-[var(--line)] pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">迁入听页书库</h3><NovelHelpLink section="legacy">Books 目录与迁入</NovelHelpLink></div><input aria-label="听页 Books 目录" value={directory} onChange={e=>{setDirectory(e.target.value);setPreview(null);}} placeholder="听页 Books 目录" className="w-full rounded-lg border p-2"/><button className={button} onClick={chooseLegacy}><FolderOpen size={16}/>选择目录并预览</button>
          {preview&&<div className="space-y-2 text-sm"><p>{preview.books.length} 本 · {preview.totalChapters} 章</p><ul className="max-h-32 overflow-auto">{preview.books.map((b,i)=><li key={i} className="truncate">{b.title} · {b.chapters} 章</li>)}</ul><button className={button} onClick={()=>void run(async()=>{const d=await novelRequest<{created:number;reused:number}>(profile,"legacy-import",{token:preview.token});await refresh();setMessage(`新增 ${d.created} 本，已有 ${d.reused} 本；原书库未修改`);setPreview(null);})}>确认复制到当前工作区</button></div>}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4"><a className={button} href={`/api/novel?action=export&profileId=${encodeURIComponent(profile)}`} download><Download size={16}/>导出托管小说</a><label className={`${button} cursor-pointer`}>恢复托管小说<input className="hidden" type="file" accept="application/json,.json" onChange={e=>{const file=e.target.files?.[0];if(file)void run(async()=>{if(file.size>80*1024*1024)throw new Error("导出文件超过 80 MB");await novelRequest(profile,"restore",{archive:JSON.parse(await file.text())});await refresh();setMessage("书籍已恢复，已有书籍未覆盖");});e.target.value="";}}/></label></div>
        </div></details>
        <details className="border-t border-[var(--line)] pt-4 text-sm"><summary className="cursor-pointer font-medium">听书声音包 · {runtime?"已安装":"未安装"}</summary><div className="mt-3 space-y-3">
          <NovelHelpLink section="kokoro">引擎与声音包安装</NovelHelpLink>
          {runtime&&<p className="text-[var(--ink-muted)]">{model}</p>}
          {!engine&&<div className="flex flex-wrap items-center gap-3"><button className={button} onClick={installEngine}><Download size={16}/>下载独立听书引擎</button><a href="https://www.python.org/downloads/" target="_blank" rel="noreferrer" className="text-xs text-[var(--ink-muted)]">Python 3.11+</a></div>}
          <label className="block space-y-2"><span>Kokoro 模型目录</span><input aria-label="Kokoro 模型目录" value={voicePath} onChange={e=>setVoicePath(e.target.value)} placeholder="解压后的 Kokoro v1.1 中英模型目录" className="w-full min-w-0 rounded-lg border border-[var(--line)] bg-white p-2"/></label>
          <div className="flex flex-wrap gap-2">{desktop&&<button className={button} onClick={()=>void run(async()=>{const chosen=await window.rmDesktop?.chooseFolder?.("导入声音包：选择解压后的 Kokoro 模型目录（不是 Books）");if(chosen)setVoicePath(chosen);})}><FolderOpen size={16}/>选择声音包目录</button>}
            <button className={button} disabled={!engine||!voicePath.trim()} onClick={()=>install(true)}><Upload size={16}/>导入声音包</button><button className={button} disabled={!engine} onClick={()=>install(false)}><Download size={16}/>下载默认完整版</button>
            <a className={button} href="https://k2-fsa.github.io/sherpa/onnx/tts/all/Chinese-English/kokoro-multi-lang-v1_1.html" target="_blank" rel="noreferrer"><ExternalLink size={16}/>完整版下载</a></div>
        </div></details>
      </fieldset>
      <div className="mt-5"><NovelPerformanceSettings/></div>
      <div className="mt-4"><NovelHelpLink section={message?"troubleshooting":"start"}/></div>
      {(busy||message)&&<p role="status" className="mt-4 break-words text-sm text-[var(--ink-muted)]">{message||(busy?"正在处理…":"")}</p>}
      {!profile&&message&&<button className={`${button} mt-3`} disabled={busy} onClick={()=>void run(loadContext)}><RefreshCw size={16}/>重新连接</button>}
    </section></div>}
  </>;
}
