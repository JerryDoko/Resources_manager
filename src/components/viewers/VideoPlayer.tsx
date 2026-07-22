"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
} from "lucide-react";
import {
  DEFAULT_VIDEO_SHORTCUTS,
  bindingDisplay,
  eventToShortcut,
  matchBinding,
  parseShortcuts,
  type VideoShortcuts,
} from "@/lib/shortcuts";
import { formatDuration } from "@/lib/utils";
import { FullscreenPortal } from "./FullscreenPortal";
import { useAppChrome } from "@/lib/useAppChrome";

export interface PlaylistItem {
  id: string;
  title: string;
  progress?: number;
}

interface Props {
  itemId: string;
  title: string;
  onClose: () => void;
  playlist?: PlaylistItem[];
  onChangeItem?: (id: string) => void;
  /** 0–1，打开时从该进度续播 */
  initialProgress?: number;
  /** 设为详情封面后回调（刷新详情） */
  onThumbnailUpdated?: () => void;
}

type HoldMode = "none" | "speed" | "rewind";

export function VideoPlayer({
  itemId,
  title,
  onClose,
  playlist = [],
  onChangeItem,
  initialProgress = 0,
  onThumbnailUpdated,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ab, setAb] = useState<{ a: number | null; b: number | null }>({
    a: null,
    b: null,
  });
  const [showSubs, setShowSubs] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [holdHint, setHoldHint] = useState<string | null>(null);
  const [shortcuts, setShortcuts] = useState<VideoShortcuts>(DEFAULT_VIDEO_SHORTCUTS);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [capturePreview, setCapturePreview] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const scrubbing = useRef(false);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rewindTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdMode = useRef<HoldMode>("none");
  const holdKey = useRef<string | null>(null);
  const normalRate = useRef(1);
  const pressed = useRef(new Set<string>());
  const { viewerHeaderClass } = useAppChrome();

  const idx = playlist.findIndex((p) => p.id === itemId);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < playlist.length - 1;

  useEffect(() => {
    fetch("/api/settings", { signal: AbortSignal.timeout(10000) })
      .then((r) => r.json())
      .then((data) => {
        try {
          const parsed = parseShortcuts(
            typeof data.videoShortcuts === "string"
              ? JSON.parse(data.videoShortcuts)
              : data.videoShortcuts
          );
          setShortcuts(parsed);
        } catch {
          /* keep defaults */
        }
      })
      .catch(() => {});
  }, []);

  const flash = useCallback((text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg(null), 1600);
  }, []);

  const saveProgress = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    fetch("/api/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "progress",
        id: itemId,
        progress: v.currentTime / v.duration,
      }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  }, [itemId]);

  const goPrev = useCallback(() => {
    if (!hasPrev || !onChangeItem) return;
    saveProgress();
    onChangeItem(playlist[idx - 1].id);
    flash(`上一个：${playlist[idx - 1].title}`);
  }, [hasPrev, onChangeItem, saveProgress, playlist, idx, flash]);

  const goNext = useCallback(() => {
    if (!hasNext || !onChangeItem) return;
    saveProgress();
    onChangeItem(playlist[idx + 1].id);
    flash(`下一个：${playlist[idx + 1].title}`);
  }, [hasNext, onChangeItem, saveProgress, playlist, idx, flash]);

  const captureFrame = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      setCapturePreview(dataUrl);
      if (!v.paused) v.pause();
    } catch {
      flash("截帧失败");
    }
  }, [flash]);

  const saveCaptureLocal = useCallback(() => {
    if (!capturePreview) return;
    const a = document.createElement("a");
    a.href = capturePreview;
    a.download = `${title}-frame.png`;
    a.click();
    flash("已保存到本地");
    setCapturePreview(null);
  }, [capturePreview, title, flash]);

  const saveCaptureAsThumb = useCallback(async () => {
    if (!capturePreview) return;
    setCaptureBusy(true);
    try {
      const res = await fetch("/api/thumbnails/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          dataUrl: capturePreview,
          // 详情页封面 + 当前视频列表缩略图
          targets: ["series", "item"],
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        flash(err.error || "设置缩略图失败");
        return;
      }
      flash("已设为详情页缩略图");
      setCapturePreview(null);
      onThumbnailUpdated?.();
    } catch {
      flash("设置缩略图失败");
    } finally {
      setCaptureBusy(false);
    }
  }, [capturePreview, itemId, flash, onThumbnailUpdated]);

  const clearHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (rewindTimer.current) {
      clearInterval(rewindTimer.current);
      rewindTimer.current = null;
    }
    const v = videoRef.current;
    if (v && holdMode.current === "speed") {
      v.playbackRate = normalRate.current;
    }
    holdMode.current = "none";
    holdKey.current = null;
    setHoldHint(null);
  }, []);

  const seekBy = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
    },
    []
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = eventToShortcut(e);
      const sc = shortcuts;

      if (pressed.current.has(key)) {
        if (matchBinding(key, sc.seekBack) || matchBinding(key, sc.seekForward)) {
          e.preventDefault();
        }
        return;
      }
      pressed.current.add(key);

      if (matchBinding(key, sc.close)) {
        e.preventDefault();
        saveProgress();
        onClose();
        return;
      }

      if (matchBinding(key, sc.playPause)) {
        e.preventDefault();
        if (v.paused) v.play();
        else v.pause();
        return;
      }

      if (matchBinding(key, sc.prevVideo)) {
        e.preventDefault();
        goPrev();
        return;
      }
      if (matchBinding(key, sc.nextVideo)) {
        e.preventDefault();
        goNext();
        return;
      }

      if (matchBinding(key, sc.frameBack)) {
        e.preventDefault();
        v.pause();
        seekBy(-1 / 30);
        return;
      }
      if (matchBinding(key, sc.frameForward)) {
        e.preventDefault();
        v.pause();
        seekBy(1 / 30);
        return;
      }

      if (matchBinding(key, sc.markA)) {
        setAb((s) => ({ ...s, a: v.currentTime }));
        flash(`A = ${v.currentTime.toFixed(1)}s`);
        return;
      }
      if (matchBinding(key, sc.markB)) {
        setAb((s) => ({ ...s, b: v.currentTime }));
        flash(`B = ${v.currentTime.toFixed(1)}s`);
        return;
      }
      if (matchBinding(key, sc.toggleSubs)) {
        setShowSubs((s) => !s);
        return;
      }
      if (matchBinding(key, sc.capture)) {
        e.preventDefault();
        captureFrame();
        return;
      }

      if (matchBinding(key, sc.seekForward)) {
        e.preventDefault();
        holdKey.current = key;
        holdMode.current = "none";
        holdTimer.current = setTimeout(() => {
          holdMode.current = "speed";
          normalRate.current = v.playbackRate || 1;
          v.playbackRate = sc.longPressSpeed;
          if (v.paused) v.play();
          setHoldHint(`${sc.longPressSpeed}×`);
        }, sc.longPressMs);
        return;
      }

      if (matchBinding(key, sc.seekBack)) {
        e.preventDefault();
        holdKey.current = key;
        holdMode.current = "none";
        holdTimer.current = setTimeout(() => {
          holdMode.current = "rewind";
          const step = sc.rewindPerSec / 10;
          rewindTimer.current = setInterval(() => {
            const el = videoRef.current;
            if (!el) return;
            el.currentTime = Math.max(0, el.currentTime - step);
          }, 100);
          setHoldHint(`⏪ ${sc.rewindPerSec}×`);
        }, sc.longPressMs);
        return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = eventToShortcut(e);
      pressed.current.delete(key);
      const sc = shortcuts;
      const v = videoRef.current;

      if (matchBinding(key, sc.seekForward) || matchBinding(key, sc.seekBack)) {
        e.preventDefault();
        const mode = holdMode.current;
        const wasHoldingThis = holdKey.current === key;

        if (holdTimer.current) {
          clearTimeout(holdTimer.current);
          holdTimer.current = null;
        }

        if (wasHoldingThis && mode === "none" && v) {
          const delta = matchBinding(key, sc.seekForward)
            ? sc.seekStep
            : -sc.seekStep;
          seekBy(delta);
        }

        if (wasHoldingThis) {
          if (rewindTimer.current) {
            clearInterval(rewindTimer.current);
            rewindTimer.current = null;
          }
          if (mode === "speed" && v) {
            v.playbackRate = normalRate.current;
          }
          holdMode.current = "none";
          holdKey.current = null;
          setHoldHint(null);
        }
      }
    };

    const onBlur = () => {
      pressed.current.clear();
      clearHold();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      clearHold();
    };
  }, [
    shortcuts,
    onClose,
    saveProgress,
    goPrev,
    goNext,
    seekBy,
    captureFrame,
    flash,
    clearHold,
  ]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (ab.a != null && ab.b != null && ab.b > ab.a && v.currentTime >= ab.b) {
        v.currentTime = ab.a;
      }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [ab]);

  // Autoplay when switching items；从已存进度续播
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    const fromPlaylist = playlist.find((p) => p.id === itemId)?.progress;
    const resume =
      typeof fromPlaylist === "number"
        ? fromPlaylist
        : initialProgress;
    const applyResume = () => {
      if (v.duration && resume > 0.01 && resume < 0.98) {
        v.currentTime = v.duration * resume;
        setCurrentTime(v.currentTime);
      }
    };
    const onMeta = () => applyResume();
    v.addEventListener("loadedmetadata", onMeta);
    v.load();
    v.play().catch(() => {});
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, [itemId, initialProgress, playlist]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const syncBuffered = () => {
      try {
        if (v.buffered.length > 0 && v.duration) {
          setBuffered(v.buffered.end(v.buffered.length - 1));
        }
      } catch {
        /* ignore */
      }
    };

    const onTime = () => {
      if (!scrubbing.current) setCurrentTime(v.currentTime);
      syncBuffered();
    };
    const onMeta = () => {
      setDuration(v.duration || 0);
      syncBuffered();
    };
    const onProgress = () => syncBuffered();

    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("durationchange", onMeta);
    v.addEventListener("progress", onProgress);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("durationchange", onMeta);
      v.removeEventListener("progress", onProgress);
    };
  }, [itemId]);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(t)) return;
    const next = Math.max(0, Math.min(v.duration || 0, t));
    v.currentTime = next;
    setCurrentTime(next);
  }, []);

  const hintLine = [
    `${bindingDisplay(shortcuts.playPause)} 播放`,
    `${bindingDisplay(shortcuts.seekBack)}/${bindingDisplay(shortcuts.seekForward)} 点按±${shortcuts.seekStep}s · 长按退/×${shortcuts.longPressSpeed}`,
    `${bindingDisplay(shortcuts.prevVideo)}/${bindingDisplay(shortcuts.nextVideo)} 上下集`,
  ].join(" · ");

  return (
    <FullscreenPortal className="fixed inset-0 z-[300] flex flex-col bg-black animate-viewer-in">
      <header
        className={`flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white/90 ${viewerHeaderClass}`}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-white/40">{hintLine}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            disabled={!hasPrev}
            onClick={goPrev}
            className="rounded-lg p-2 hover:bg-white/10 disabled:opacity-30"
            title={`上一个 (${bindingDisplay(shortcuts.prevVideo)})`}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            disabled={!hasNext}
            onClick={goNext}
            className="rounded-lg p-2 hover:bg-white/10 disabled:opacity-30"
            title={`下一个 (${bindingDisplay(shortcuts.nextVideo)})`}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            onClick={() => {
              saveProgress();
              onClose();
            }}
            className="rounded-lg p-2 hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* 取宽高约束中较小的一边等比适配 */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2">
        <video
          ref={videoRef}
          src={`/api/media/${itemId}`}
          className="h-full w-full object-contain"
          playsInline
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            saveProgress();
          }}
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) v.play();
            else v.pause();
          }}
        >
          {showSubs && (
            <track
              kind="subtitles"
              src={`/api/media/${itemId}/subs`}
              srcLang="zh"
              label="字幕"
              default
            />
          )}
        </video>

        {!showSubs && (
          <span className="absolute left-4 top-4 rounded bg-black/50 px-2 py-1 text-xs text-white/70">
            字幕已关闭 ({bindingDisplay(shortcuts.toggleSubs)})
          </span>
        )}
        {holdHint && (
          <div className="absolute right-6 top-6 rounded-full bg-black/60 px-4 py-2 text-lg font-medium text-white">
            {holdHint}
          </div>
        )}
        {msg && (
          <div className="absolute bottom-8 rounded-full bg-white/90 px-4 py-2 text-sm text-black">
            {msg}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-3 px-4 pb-4 pt-2 text-white">
        {/* 进度条：轨道与拇指同比例，时间在下方对齐 */}
        <div className="mx-auto w-full max-w-3xl">
          <div className="relative flex h-3 items-center">
            <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-white/20">
              <div
                className="absolute inset-y-0 left-0 bg-white/35"
                style={{
                  width: duration
                    ? `${Math.min(100, (buffered / duration) * 100)}%`
                    : "0%",
                }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]"
                style={{
                  width: duration
                    ? `${Math.min(100, (currentTime / duration) * 100)}%`
                    : "0%",
                }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.05}
              value={Number.isFinite(currentTime) ? currentTime : 0}
              disabled={!duration}
              onMouseDown={() => {
                scrubbing.current = true;
              }}
              onTouchStart={() => {
                scrubbing.current = true;
              }}
              onChange={(e) => {
                const t = Number(e.target.value);
                setCurrentTime(t);
              }}
              onMouseUp={(e) => {
                scrubbing.current = false;
                seekTo(Number((e.target as HTMLInputElement).value));
              }}
              onTouchEnd={(e) => {
                scrubbing.current = false;
                seekTo(Number((e.target as HTMLInputElement).value));
              }}
              onKeyUp={(e) => {
                scrubbing.current = false;
                seekTo(Number((e.target as HTMLInputElement).value));
              }}
              className="video-scrubber absolute inset-0 z-10 h-full w-full cursor-pointer appearance-none bg-transparent"
              aria-label="播放进度"
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[11px] tabular-nums text-white/65">
            <span>{formatDuration(currentTime)}</span>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => seekBy(-shortcuts.seekStep)}
            className="rounded-full bg-white/10 p-3 hover:bg-white/20"
          >
            <SkipBack className="h-5 w-5" />
          </button>
          <button
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) v.play();
              else v.pause();
            }}
            className="rounded-full bg-[var(--accent)] p-4 hover:brightness-110"
          >
            {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </button>
          <button
            onClick={() => seekBy(shortcuts.seekStep)}
            className="rounded-full bg-white/10 p-3 hover:bg-white/20"
          >
            <SkipForward className="h-5 w-5" />
          </button>
          <button
            onClick={captureFrame}
            className="rounded-full bg-white/10 p-3 hover:bg-white/20"
            title={`截取当前帧 (${bindingDisplay(shortcuts.capture)})`}
          >
            <Camera className="h-5 w-5" />
          </button>
          {(ab.a != null || ab.b != null) && (
            <span className="ml-2 text-xs text-white/60">
              A-B: {ab.a?.toFixed(1) ?? "—"} → {ab.b?.toFixed(1) ?? "—"}
            </span>
          )}
          {playlist.length > 0 && (
            <span className="ml-2 text-xs text-white/40">
              {Math.max(idx + 1, 1)} / {playlist.length}
            </span>
          )}
        </div>
      </div>

      {capturePreview && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/15 bg-[#1a1f20] shadow-2xl">
            <div className="border-b border-white/10 px-4 py-3">
              <p className="text-sm font-medium text-white">截取当前帧</p>
              <p className="mt-0.5 text-xs text-white/50">选择保存方式</p>
            </div>
            <div className="bg-black/40 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capturePreview}
                alt="截帧预览"
                className="mx-auto max-h-[42vh] w-auto rounded-lg object-contain"
              />
            </div>
            <div className="flex flex-col gap-2 p-4 sm:flex-row">
              <button
                type="button"
                disabled={captureBusy}
                onClick={saveCaptureLocal}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm text-white hover:bg-white/15 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                保存到本地
              </button>
              <button
                type="button"
                disabled={captureBusy}
                onClick={saveCaptureAsThumb}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-3 py-2.5 text-sm text-white hover:brightness-110 disabled:opacity-50"
              >
                <ImagePlus className="h-4 w-4" />
                设为详情页缩略图
              </button>
            </div>
            <div className="border-t border-white/10 px-4 py-2.5 text-right">
              <button
                type="button"
                disabled={captureBusy}
                onClick={() => setCapturePreview(null)}
                className="text-xs text-white/50 hover:text-white"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </FullscreenPortal>
  );
}
