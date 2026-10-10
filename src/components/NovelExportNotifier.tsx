"use client";
import {useEffect,useState} from "react";
import {CheckCircle2,AlertCircle,Info,FolderOpen,X} from "lucide-react";
import {notifyNovelExport,type NovelExportNotice} from "@/lib/novel/export-notices";
type Notice=NovelExportNotice&{id:number};
let nextId=0;
export function NovelExportNotifier(){
  const [notices,setNotices]=useState<Notice[]>([]);
  useEffect(()=>{
    const timers=new Set<ReturnType<typeof setTimeout>>();
    const receive=(event:Event)=>{const notice=(event as CustomEvent<NovelExportNotice>).detail,id=++nextId;setNotices(list=>[...list.filter(n=>!notice.key||n.key!==notice.key),{...notice,id}].slice(-3));if(notice.kind==="info"){const timer=setTimeout(()=>{setNotices(list=>list.filter(n=>n.id!==id));timers.delete(timer);},8000);timers.add(timer);}};
    window.addEventListener("rm:novel-export-notice",receive);
    const unsubscribe=window.rmDesktop?.onNovelAudioDownload?.(download=>{
      window.dispatchEvent(new CustomEvent("rm:novel-audio-download",{detail:download}));
      if(download.state==="started")return;
      if(download.state==="completed")notifyNovelExport({kind:"success",title:"语音保存成功",message:download.path||download.filename,path:download.path,key:download.id});
      else notifyNovelExport({kind:download.state==="cancelled"?"info":"error",title:download.state==="cancelled"?"已取消保存":"语音保存失败",message:download.state==="cancelled"?"生成的语音仍可重新保存。":"下载中断或文件写入失败，请重新保存。",key:download.id});
    });
    return()=>{window.removeEventListener("rm:novel-export-notice",receive);unsubscribe?.();for(const timer of timers)clearTimeout(timer);};
  },[]);
  const reveal=async(notice:Notice)=>{try{if(!notice.path||!await window.rmDesktop?.revealItem?.(notice.path))throw new Error("文件已移动、删除或无法打开所在文件夹。");}catch(e){setNotices(list=>list.map(n=>n.id===notice.id?{...n,kind:"error",title:"无法定位文件",message:e instanceof Error?e.message:String(e),path:undefined}:n));}};
  if(!notices.length)return null;
  return <aside data-novel-export-notices aria-label="小说语音导出提醒" className="pointer-events-none fixed right-4 top-4 z-[400] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">{notices.map(notice=><section key={notice.id} role={notice.kind==="error"?"alert":"status"} className="rounded-lg border border-[var(--line)] bg-[var(--paper)] p-4 text-[var(--ink)] shadow-xl">
    <div className="flex items-start gap-2">{notice.kind==="success"?<CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-700"/>:notice.kind==="error"?<AlertCircle size={18} className="mt-0.5 shrink-0 text-red-700"/>:<Info size={18} className="mt-0.5 shrink-0 text-[var(--accent)]"/>}<h3 className="min-w-0 flex-1 text-sm font-semibold">{notice.title}</h3><button className="pointer-events-auto" aria-label="关闭导出提醒" title="关闭提醒" onClick={()=>setNotices(list=>list.filter(n=>n.id!==notice.id))}><X size={16}/></button></div>
    <p className="mt-2 break-all text-xs text-[var(--ink-muted)]">{notice.message}</p>
    {notice.path&&<button className="pointer-events-auto mt-3 inline-flex items-center gap-2 text-sm text-[var(--accent)]" onClick={()=>void reveal(notice)}><FolderOpen size={16}/>{typeof window!=="undefined"&&window.rmDesktop?.platform==="darwin"?"在访达中显示":"在文件夹中显示"}</button>}
  </section>)}</aside>;
}
