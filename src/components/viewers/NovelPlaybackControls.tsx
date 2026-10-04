"use client";
import { useState } from "react";
import { Headphones, Pause, Play, RotateCcw, SkipBack, SkipForward, SlidersHorizontal, Volume2, VolumeX } from "lucide-react";
import type { NovelPlayback, PlaybackState } from "@/lib/novel/playback-controller";
import { DEFAULT_PREFERENCES, RATES } from "@/lib/novel/types";
const icon="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-white/70 hover:bg-white disabled:opacity-40";
export function NovelPlaybackControls({controller,state,compact=false,onSettingsChange}:{controller:NovelPlayback;state:PlaybackState;compact?:boolean;onSettingsChange?:(open:boolean)=>void}) {
  const [settings,setSettings]=useState(false),prefs=state.book?.preferences||DEFAULT_PREFERENCES;
  const toggleSettings=()=>{setSettings(!settings);onSettingsChange?.(!settings);};
  return <div className="relative">
    {settings&&<section aria-label="朗读设置" className={`${compact?"fixed inset-x-2 bottom-2 top-12":"absolute bottom-full right-0 mb-3 w-80 max-w-[90vw]"} z-10 overflow-auto rounded-lg border border-[var(--line)] bg-[#fafbf9] p-4 shadow-lg`}>
      <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">朗读设置</h3><button aria-label="关闭朗读设置" onClick={toggleSettings} className="text-sm text-[var(--ink-muted)]">完成</button></div>
      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-sm">
        <label htmlFor={compact?"mini-engine":"novel-engine"}>引擎</label><select id={compact?"mini-engine":"novel-engine"} aria-label="朗读引擎" value={prefs.engine} onChange={e=>void controller.update({engine:e.target.value as "kokoro"|"system"})} className="rounded-md border bg-white p-1.5"><option value="kokoro">本地 Kokoro</option><option value="system">系统语音</option></select>
        <label htmlFor={compact?"mini-voice":"novel-voice"}>音色</label><div className="flex min-w-0 gap-2"><select id={compact?"mini-voice":"novel-voice"} aria-label="音色" disabled={prefs.engine!=="kokoro"} value={prefs.voiceId} onChange={e=>void controller.update({voiceId:+e.target.value})} className="min-w-0 flex-1 rounded-md border bg-white p-1.5"><optgroup label="女声">{Array.from({length:55},(_,i)=><option key={i+3} value={i+3}>女声 {String(i+1).padStart(2,"0")}</option>)}</optgroup><optgroup label="男声">{Array.from({length:45},(_,i)=><option key={i+58} value={i+58}>男声 {String(i+1).padStart(2,"0")}</option>)}</optgroup></select><button className={icon} title="试听音色" aria-label="试听音色" disabled={!state.book||prefs.engine!=="kokoro"} onClick={()=>void controller.preview()}><Headphones size={16}/></button></div>
        <label htmlFor={compact?"mini-rate":"novel-rate"}>倍速</label><select id={compact?"mini-rate":"novel-rate"} aria-label="朗读倍速" value={prefs.rate} onChange={e=>void controller.update({rate:+e.target.value})} className="rounded-md border bg-white p-1.5">{RATES.map(rate=><option key={rate} value={rate}>{rate}×</option>)}</select>
        <label htmlFor={compact?"mini-volume":"novel-volume"}>音量</label><div className="flex min-w-0 items-center gap-2"><input id={compact?"mini-volume":"novel-volume"} aria-label="朗读音量" type="range" min={0} max={1} step={.05} value={prefs.volume} onChange={e=>void controller.update({volume:+e.target.value})} className="min-w-0 flex-1 accent-[var(--accent)]"/><output className="w-9 text-right text-xs">{Math.round(prefs.volume*100)}%</output></div>
        <span>原文</span><label className="flex items-center gap-2"><input type="checkbox" checked={prefs.follow} onChange={e=>void controller.update({follow:e.target.checked})}/>跟随朗读</label>
      </div>
      <button className="mt-3 inline-flex items-center gap-2 text-xs text-[var(--ink-muted)]" onClick={()=>void controller.update(DEFAULT_PREFERENCES)}><RotateCcw size={14}/>恢复默认设置</button>
    </section>}
    <div className="flex items-center gap-2">
      <button className={icon} title="上一段" aria-label="上一段" onClick={()=>void controller.skip(-1)}><SkipBack size={17}/></button>
      <button disabled={!state.chapter} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white disabled:opacity-40" title={state.playing||state.preview?"暂停":"播放"} aria-label={state.playing||state.preview?"暂停朗读":"开始朗读"} onClick={()=>void (state.playing||state.preview?controller.pause():controller.play())}>{state.playing||state.preview?<Pause size={20}/>:<Play size={20}/>}</button>
      <button className={icon} title="下一段" aria-label="下一段" onClick={()=>void controller.skip(1)}><SkipForward size={17}/></button>
      <div className="min-w-0 flex-1 px-1"><p className="truncate text-xs font-medium">{state.status}</p><p className="mt-0.5 truncate text-[11px] text-[var(--ink-muted)]">{Math.min(state.index+1,state.chapter?.chunks.length||0)}/{state.chapter?.chunks.length||0} 段 · {state.seconds.toFixed(1)} 秒 · {prefs.rate}×{!compact?` · 缓冲 ${state.buffered}/2`:""}</p></div>
      <button className={icon} title={prefs.volume?"静音":"恢复音量"} aria-label={prefs.volume?"静音":"恢复音量"} onClick={()=>void controller.update(prefs.volume?{previousVolume:prefs.volume,volume:0}:{volume:prefs.previousVolume||1})}>{prefs.volume?<Volume2 size={17}/>:<VolumeX size={17}/>}</button>
      <button className={icon} title="朗读设置" aria-label="朗读设置" aria-expanded={settings} onClick={toggleSettings}><SlidersHorizontal size={17}/></button>
    </div>
  </div>;
}
