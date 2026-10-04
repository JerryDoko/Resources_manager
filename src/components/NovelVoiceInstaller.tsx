"use client";
import { useCallback, useEffect, useState } from "react";
import models from "../../runtime/kokoro/models.json";
import { novelRequest } from "@/lib/novel/client";

type Progress = { running: boolean; phase: string; done: number; total: number; error: string };
type Storage = {directory:string;packages:{name:string;path:string}[];guide:string};
export function NovelVoiceInstaller({ profileId, available, installedModel, onInstalled }: { profileId: string; available: boolean; installedModel?: string; onInstalled: () => Promise<void> }) {
  const [modelId, setModelId] = useState(models[0].id);
  const [method, setMethod] = useState("online");
  const [directory, setDirectory] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [storage,setStorage]=useState<Storage|null>(null);
  const loadStorage=useCallback(async()=>{const r=await fetch(`/api/novel?action=voice-storage&profileId=${encodeURIComponent(profileId)}`);const d=await r.json();if(!r.ok)throw new Error(d.error);setStorage(d);},[profileId]);
  useEffect(()=>{if(profileId)void loadStorage().catch(e=>setMessage(e.message));},[profileId,loadStorage]);
  const selected = models.find(m => m.id === modelId)!;
  useEffect(() => {
    if (!profileId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`/api/novel?action=runtime-status&profileId=${encodeURIComponent(profileId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "读取安装状态失败");
        if (cancelled) return;
        setProgress(data); setBusy(data.running);
        if (data.error) setMessage(data.error);
        if (data.running) timer = setTimeout(poll, 1000);
        else if (data.phase === "安装完成") { await onInstalled(); }
      } catch (e) { if (!cancelled) { setMessage(e instanceof Error ? e.message : String(e)); setBusy(false); } }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
    // A new installation begins polling again, including after a page reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, progress?.running]);
  const choose = async () => {
    try {
      if (window.rmDesktop?.chooseFolder) {
        const path = await window.rmDesktop.chooseFolder("选择本地模型或完整离线声音包目录");
        if (path) setDirectory(path);
      } else {
        const response = await fetch("/api/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "browse", profileId, prompt: "选择本地模型或完整离线声音包目录" }) });
        const data = await response.json(); if (!response.ok || data.error) throw new Error(data.error || "请选择目录");
        if (data.path) setDirectory(data.path);
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
  };
  const install = async () => {
    setMessage(""); setBusy(true);
    try {
      const result = await novelRequest<Progress>(profileId, "install-runtime", { modelId, ...(method === "offline" ? { directory } : {}) });
      setProgress(result);
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  const button = "rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm disabled:opacity-40";
  return <details className="border-t border-[var(--line)] pt-4 text-sm">
    <summary className="cursor-pointer font-medium">听书声音包 · {available ? "已安装" : "未安装"}</summary>
    <div className="mt-3 space-y-3">
      {available && <p className="text-xs text-green-700">当前使用：{models.find(model => model.id === installedModel)?.name || "已安装声音包"}</p>}
      {storage&&<div className="space-y-2 rounded-lg border border-[var(--line)] bg-white p-3"><p className="font-medium">模型存放位置</p><input aria-label="模型存放位置" readOnly value={storage.directory} className="w-full rounded border bg-[var(--paper)] p-2 text-xs"/><p className="text-xs text-[var(--ink-muted)]">下载模型后解压，将整个模型文件夹放到这里，再选择下方列表安装。也可直接安装其他位置的模型。</p><div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={()=>void novelRequest(profileId,"open-voice-storage").catch(e=>setMessage(e.message))}>打开存放目录</button><button type="button" className={button} onClick={()=>void loadStorage().catch(e=>setMessage(e.message))}>刷新目录</button><a href={storage.guide} target="_blank" rel="noreferrer" className="px-2 py-2 text-xs text-[var(--accent)] underline">GitHub 安装与性能说明</a></div>{storage.packages.map(item=><button type="button" key={item.path} disabled={busy} className="block w-full truncate rounded border p-2 text-left text-xs hover:bg-[var(--accent-soft)]" title={item.path} onClick={()=>{setDirectory(item.path);setMethod("offline");setMessage("");}}>使用此目录：{item.name}</button>)}</div>}
      <p className="text-xs text-[var(--ink-muted)]">首次安装会自动配置独立 Python 和语音依赖，无需预先安装 Python。安装后可离线听书。</p>
      <label className="block space-y-1">语音模型<select aria-label="语音模型" value={modelId} disabled={busy || method === "offline"} onChange={e => setModelId(e.target.value)} className="block w-full rounded-lg border bg-white p-2 disabled:opacity-50">{models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <p className="text-xs text-[var(--ink-muted)]">{method === "offline" ? "本地安装会自动识别模型版本，以目录中的实际模型为准。" : selected.description}</p>
      <label className="block space-y-1">安装方式<select aria-label="声音包安装方式" value={method} disabled={busy} onChange={e => setMethod(e.target.value)} className="block w-full rounded-lg border bg-white p-2"><option value="online">在线自动下载与配置</option><option value="offline">安装本地模型 / 离线声音包</option></select></label>
      {method === "offline" && <div className="space-y-2"><p className="text-xs text-[var(--ink-muted)]">选择解压后的 Kokoro 模型目录或完整声音包。自动识别同名嵌套目录和模型版本，并优先复用内置 Python；缺少运行时则联网自动配置。</p><div className="flex gap-2"><input aria-label="离线声音包目录" value={directory} disabled={busy} onChange={e => setDirectory(e.target.value)} placeholder="例如 D:\resources-manager\kokoro-multi-lang-v1_1" className="min-w-0 flex-1 rounded-lg border bg-white p-2"/><button type="button" className={button} disabled={busy} onClick={() => void choose()}>选择目录</button></div></div>}
      <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy || !profileId || (method === "offline" && !directory.trim())} onClick={() => void install()}>{busy ? "正在安装…" : available ? "安装所选模型 / 重试" : "安装声音包 / 重试"}</button><a href={selected.url} target="_blank" rel="noreferrer" className="px-2 py-2 text-xs text-[var(--accent)] underline">官方模型下载</a></div>
      <p className="text-xs text-[var(--ink-muted)]">已下载的官方模型请先解压后选择目录，无需重复下载。完整离线包需含 python、model 和 manifest.json，可在没有网络的电脑上安装。</p>
      {progress?.running && <div role="status" className="space-y-1"><p>{progress.phase}{progress.total > 0 ? ` · ${Math.min(100, Math.floor(progress.done / progress.total * 100))}%` : ""}</p>{progress.total > 0 && <progress className="w-full" value={progress.done} max={progress.total}/>}</div>}
      {!progress?.running && progress?.phase === "安装完成" && <p role="status" className="text-green-700">声音包安装完成，可开始听书。</p>}
      {message && <p role="alert" className="break-words text-amber-800">{message}</p>}
    </div>
  </details>;
}
