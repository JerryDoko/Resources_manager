"use client";
import { useEffect, useId, useState } from "react";
import { Gauge, RotateCcw, Save, TestTubeDiagonal } from "lucide-react";
import { novelFetch, novelRequest } from "@/lib/novel/client";
import type { PerformanceMode, PerformanceSettings } from "@/lib/novel/performance-settings";
import type { BenchmarkResult } from "@/lib/novel/worker-probe";
import { NovelHelpLink } from "./NovelHelpLink";

const modes: { value: PerformanceMode; label: string; threads?: number }[] = [
  { value: "low", label: "低占用", threads: 1 }, { value: "balanced", label: "均衡", threads: 2 },
  { value: "speed", label: "优先速度", threads: 4 }, { value: "custom", label: "自定义" },
];
export function NovelPerformanceSettings() {
  const id = useId();
  const [settings, setSettings] = useState<PerformanceSettings>({ mode: "balanced", threads: 2 });
  const [limit, setLimit] = useState(1), [profile, setProfile] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [result, setResult] = useState<(BenchmarkResult & { mode: PerformanceMode }) | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void novelFetch("/api/novel?action=performance", { signal: abort.signal }).then(async r => {
      const data = await r.json(); if (!r.ok) throw new Error(data.error);
      setSettings(data.settings); setLimit(data.maxThreads); setProfile(data.profileId);
    }).catch(e => { if (!abort.signal.aborted) setMessage(e.message); });
    return () => abort.abort();
  }, []);
  const run = async (action: "performance-test" | "performance-save") => {
    setBusy(true); setMessage("");
    try {
      if (action === "performance-test") {
        setResult(null); setResult(await novelRequest(profile, action, { settings }));
        setMessage("测试完成 · 未保存设置");
      } else {
        setSettings(await novelRequest(profile, action, { settings }));
        setMessage("已保存 · 所有工作区生效 · 下一段新生成时应用");
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const button = "inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm disabled:opacity-40";
  return <details className="border-t border-[var(--line)] pt-4">
    <summary className="cursor-pointer text-sm font-medium"><Gauge size={16} className="mr-2 inline-block"/>听书性能设置</summary>
    <div className="mt-3 space-y-3">
      <NovelHelpLink section="performance">线程选择与生成速度</NovelHelpLink>
      <fieldset disabled={busy || !profile} className="space-y-3 disabled:opacity-60">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor={`${id}-mode`} className="text-sm">模式</label>
          <select id={`${id}-mode`} aria-label="听书性能模式" className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm" value={settings.mode} onChange={e => {
            const mode = modes.find(m => m.value === e.target.value)!;
            setSettings({ mode: mode.value, threads: Math.min(limit, mode.threads || settings.threads) });
          }}>{modes.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
          <span className="text-sm text-[var(--ink-muted)]">CPU {settings.threads} / {limit} 线程</span>
        </div>
        {settings.mode === "custom" && <div className="flex items-center gap-3">
          <label htmlFor={`${id}-threads`} className="shrink-0 text-sm">CPU 线程</label>
          <input id={`${id}-threads`} aria-label="听书 CPU 线程" type="range" min={1} max={limit} step={1} value={settings.threads} onChange={e => setSettings({ mode: "custom", threads: Number(e.target.value) })} className="min-w-0 flex-1 accent-[var(--accent)]"/>
          <output className="w-8 text-right tabular-nums">{settings.threads}</output>
        </div>}
        <div className="flex flex-wrap gap-2"><button className={button} onClick={() => void run("performance-test")}><TestTubeDiagonal size={16}/>测试生成速度</button>
          <button className={button} onClick={() => void run("performance-save")}><Save size={16}/>保存性能设置</button>
          <button className={button} onClick={() => { setSettings({ mode: "balanced", threads: Math.min(2, limit) }); setMessage("已选择默认值 · 尚未保存"); }}><RotateCcw size={16}/>恢复默认</button></div>
      </fieldset>
      {result && <div className="border-t border-[var(--line)] pt-3 text-sm">
        <p className="mb-2 text-[var(--ink-muted)]">{modes.find(m => m.value === result.mode)?.label} · {result.threads} 线程 · 固定中文测试</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">{[
          ["模型加载", `${result.loadSeconds.toFixed(2)} 秒`], ["生成耗时", `${result.elapsed.toFixed(2)} 秒`],
          ["音频时长", `${result.duration.toFixed(2)} 秒`], ["实时系数", result.rtf.toFixed(3)],
        ].map(([label, value]) => <div key={label}><dt className="text-xs text-[var(--ink-muted)]">{label}</dt><dd className="mt-1 tabular-nums">{value}</dd></div>)}</dl>
      </div>}
      {(busy || message) && <p role="status" className="break-words text-sm text-[var(--ink-muted)]">{busy ? "正在测试 / 保存…" : message}</p>}
    </div>
  </details>;
}
