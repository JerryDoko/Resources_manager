"use client";
import { useEffect, useState } from "react";
import { novelRequest } from "@/lib/novel/client";
type Settings = { mode: "quiet" | "balanced" | "fast" | "custom"; threads: number; cores: number; maxThreads: number; memoryGB: number };
export function NovelVoicePerformance({profileId}:{profileId:string}) {
  const [settings,setSettings]=useState<Settings|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const [benchmark,setBenchmark]=useState<{threads:number;loadMs:number;elapsed:number;duration:number;realtimeRatio:number}|null>(null);
  useEffect(()=>{if(!profileId)return;let disposed=false;void fetch(`/api/novel?action=voice-performance&profileId=${encodeURIComponent(profileId)}`).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);if(!disposed)setSettings(d);}).catch(e=>{if(!disposed)setMessage(e.message);});return()=>{disposed=true;};},[profileId]);
  const save=async()=>{if(!settings)return;setBusy(true);setMessage("");try{setSettings(await novelRequest<Settings>(profileId,"voice-performance",{mode:settings.mode,...(settings.mode==="custom"?{threads:settings.threads}:{})}));setMessage("已保存，从下一次生成新片段开始生效。");}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  const testSpeed=async()=>{if(!settings)return;setBusy(true);setMessage("正在合成固定测试文本，首次加载模型可能需要一段时间…");try{setBenchmark(await novelRequest(profileId,"voice-benchmark",{mode:settings.mode,...(settings.mode==="custom"?{threads:settings.threads}:{})}));setMessage("测速完成。测试不改变正在阅读的内容或性能设置。");}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
  return <details className="border-t border-[var(--line)] pt-4 text-sm"><summary className="cursor-pointer font-medium">听书性能设置</summary><div className="mt-3 space-y-3">
    {settings&&<><p className="text-xs text-[var(--ink-muted)]">本机 {settings.cores} 个逻辑处理器 · {settings.memoryGB} GB 内存。当前使用 CPU 合成。</p>
      <label className="block space-y-1">性能模式<select aria-label="听书性能模式" className="block w-full rounded-lg border bg-white p-2" disabled={busy} value={settings.mode} onChange={e=>setSettings({...settings,mode:e.target.value as Settings["mode"]})}><option value="quiet">低占用 · 1 线程</option><option value="balanced">均衡 · 最多 2 线程</option><option value="fast">优先速度 · 最多 4 线程</option><option value="custom">自定义线程数</option></select></label>
      {settings.mode==="custom"&&<label className="block space-y-1">CPU 线程数<input aria-label="语音 CPU 线程数" type="number" min={1} max={settings.maxThreads} value={settings.threads} disabled={busy} onChange={e=>setSettings({...settings,threads:Number(e.target.value)})} className="block w-full rounded-lg border bg-white p-2"/></label>}
      <p className="text-xs text-[var(--ink-muted)]">建议分别测试当前模型的 2 和 4 线程，再保存更快的配置。轻量模型体积较小，但生成速度请以实测为准。更多线程不一定更快，也会提高 CPU 占用。首段包含模型加载时间；已生成片段会直接复用缓存。朗读倍速只影响播放。</p>
      <div className="flex gap-2"><button type="button" disabled={busy} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40" onClick={()=>void save()}>保存性能设置</button><button type="button" disabled={busy} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40" onClick={()=>void testSpeed()}>测试生成速度</button></div>
      {benchmark&&<p role="status" className="rounded-lg bg-[var(--accent-soft)] p-3 text-xs">实测 {benchmark.threads} 线程：加载 {(benchmark.loadMs/1000).toFixed(2)} 秒，合成 {benchmark.elapsed.toFixed(2)} 秒，音频 {benchmark.duration.toFixed(2)} 秒。实时系数 {benchmark.realtimeRatio.toFixed(2)}（越低越快；小于 1 表示生成速度快于正常播放）。</p>}</>}
    {message&&<p role="status" className="text-xs text-[var(--ink-muted)]">{message}</p>}
  </div></details>;
}
