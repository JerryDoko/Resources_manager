"use client";

import { useEffect, useRef, useState } from "react";
import { Music2, Pause, Play, X } from "lucide-react";
import { useLibrary } from "@/lib/store";

export function MusicDock() {
  const { musicQueue, setMusicQueue } = useLibrary();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!musicQueue) return;
    const a = audioRef.current;
    if (!a) return;
    a.src = `/api/media/${musicQueue.id}`;
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [musicQueue]);

  if (!musicQueue) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-40 flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-2xl border border-[var(--line)] bg-white/95 px-4 py-3 shadow-xl backdrop-blur-xl animate-fade-up">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
        <Music2 className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{musicQueue.title}</p>
        <p className="truncate text-xs text-[var(--ink-muted)]">
          {musicQueue.artist || "未知艺术家"}
        </p>
      </div>
      <button
        onClick={() => {
          const a = audioRef.current;
          if (!a) return;
          if (a.paused) {
            a.play();
            setPlaying(true);
          } else {
            a.pause();
            setPlaying(false);
          }
        }}
        className="rounded-full bg-[var(--ink)] p-2.5 text-white"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <button
        onClick={() => {
          audioRef.current?.pause();
          setMusicQueue(null);
        }}
        className="rounded-lg p-2 text-[var(--ink-faint)] hover:bg-[var(--bg)]"
      >
        <X className="h-4 w-4" />
      </button>
      <audio
        ref={audioRef}
        onEnded={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
    </div>
  );
}
