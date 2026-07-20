"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Play, Pause } from "lucide-react";

export interface MangaPageItem {
  id: string;
  title: string;
  path?: string;
}

interface Props {
  itemId: string;
  title: string;
  mediaType: string;
  onClose: () => void;
  /** 同系列图片项，用于文件夹漫画连续翻页 / 放映 */
  playlist?: MangaPageItem[];
  onChangeItem?: (id: string) => void;
}

const IMAGE_PAGE_RE = /\.(jpe?g|png|webp|gif|avif|apng|bmp)$/i;
const ANIMATED_RE = /\.(gif|webp|apng)$/i;

function isLikelyAnimated(nameOrPath: string): boolean {
  return ANIMATED_RE.test(nameOrPath);
}

export function MangaReader({
  itemId,
  title,
  mediaType,
  onClose,
  playlist = [],
  onChangeItem,
}: Props) {
  const [archivePages, setArchivePages] = useState<string[]>([]);
  const [archiveIndex, setArchiveIndex] = useState(0);
  const [mode, setMode] = useState<"archive" | "playlist" | "single" | "loading">(
    "loading"
  );
  const [error, setError] = useState<string | null>(null);
  const [slideshow, setSlideshow] = useState(false);
  const [intervalSec, setIntervalSec] = useState(3);
  const imgRef = useRef<HTMLImageElement>(null);

  const imagePlaylist = useMemo(
    () => playlist.filter((p) => !p.path || IMAGE_PAGE_RE.test(p.path)),
    [playlist]
  );

  const playlistIndex = imagePlaylist.findIndex((p) => p.id === itemId);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setArchiveIndex(0);
    (async () => {
      try {
        const pagesRes = await fetch(`/api/media/${itemId}?mode=pages`, {
          signal: AbortSignal.timeout(15000),
        });
        if (pagesRes.ok) {
          const data = await pagesRes.json();
          if (!cancelled && data.pages?.length) {
            setArchivePages(data.pages);
            setMode("archive");
            return;
          }
        }
      } catch {
        /* fall through */
      }

      if (cancelled) return;

      // 文件夹系列：用同系列图片项作为页
      if (imagePlaylist.length > 1 && playlistIndex >= 0) {
        setMode("playlist");
        return;
      }

      setMode("single");
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, imagePlaylist.length, playlistIndex]);

  const totalPages =
    mode === "archive"
      ? archivePages.length
      : mode === "playlist"
        ? imagePlaylist.length
        : 1;

  const currentPage =
    mode === "archive"
      ? archiveIndex
      : mode === "playlist"
        ? Math.max(0, playlistIndex)
        : 0;

  const currentName =
    mode === "archive"
      ? archivePages[archiveIndex] || ""
      : mode === "playlist"
        ? imagePlaylist[playlistIndex]?.path ||
          imagePlaylist[playlistIndex]?.title ||
          ""
        : title;

  const animated = isLikelyAnimated(currentName);

  const imageSrc =
    mode === "archive"
      ? `/api/media/${itemId}?mode=page&i=${archiveIndex}`
      : `/api/media/${itemId}`;

  const go = useCallback(
    (delta: number) => {
      if (mode === "archive") {
        setArchiveIndex((p) =>
          Math.max(0, Math.min(archivePages.length - 1, p + delta))
        );
        return;
      }
      if (mode === "playlist" && onChangeItem && imagePlaylist.length) {
        const next = playlistIndex + delta;
        if (next < 0 || next >= imagePlaylist.length) {
          if (slideshow) setSlideshow(false);
          return;
        }
        onChangeItem(imagePlaylist[next].id);
      }
    },
    [
      mode,
      archivePages.length,
      onChangeItem,
      imagePlaylist,
      playlistIndex,
      slideshow,
    ]
  );

  // 放映：自动翻页（动图稍延长停留）
  useEffect(() => {
    if (!slideshow) return;
    const delay = (animated ? intervalSec + 2 : intervalSec) * 1000;
    const t = window.setTimeout(() => {
      if (mode === "archive") {
        if (archiveIndex >= archivePages.length - 1) {
          setSlideshow(false);
          return;
        }
        setArchiveIndex((p) => p + 1);
      } else if (mode === "playlist") {
        if (playlistIndex >= imagePlaylist.length - 1) {
          setSlideshow(false);
          return;
        }
        go(1);
      } else {
        setSlideshow(false);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [
    slideshow,
    intervalSec,
    animated,
    mode,
    archiveIndex,
    archivePages.length,
    playlistIndex,
    imagePlaylist.length,
    go,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
      if (e.key.toLowerCase() === "p") setSlideshow((s) => !s);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  useEffect(() => {
    if (totalPages <= 1) return;
    const progress =
      mode === "archive"
        ? (archiveIndex + 1) / archivePages.length
        : mode === "playlist"
          ? (playlistIndex + 1) / imagePlaylist.length
          : 0;
    fetch("/api/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "progress",
        id: itemId,
        progress,
      }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  }, [
    archiveIndex,
    archivePages.length,
    playlistIndex,
    imagePlaylist.length,
    itemId,
    mode,
    totalPages,
  ]);

  const pageLabel =
    mode === "loading"
      ? "加载中"
      : mode === "single"
        ? animated
          ? "动图 / WebP"
          : "单页"
        : `${currentPage + 1} / ${totalPages}${animated ? " · 动图" : ""}`;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0f1415]">
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-white/90">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="text-xs text-white/50">
            {pageLabel}
            {slideshow ? " · 放映中" : ""} · ←/→ 翻页 · P 放映
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(mode === "archive" || mode === "playlist") && totalPages > 1 && (
            <>
              <label className="flex items-center gap-1 text-xs text-white/50">
                间隔
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={intervalSec}
                  onChange={(e) =>
                    setIntervalSec(Math.max(1, Number(e.target.value) || 3))
                  }
                  className="w-12 rounded border border-white/20 bg-black/40 px-1 py-0.5 text-white"
                />
                s
              </label>
              <button
                onClick={() => setSlideshow((s) => !s)}
                className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20"
                title="放映 (P)"
              >
                {slideshow ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                放映
              </button>
            </>
          )}
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div
        className={`relative flex min-h-0 flex-1 overflow-hidden ${
          mediaType === "webtoon"
            ? "justify-center overflow-y-auto scrollbar-thin"
            : "items-center justify-center"
        }`}
      >
        {mode === "loading" && (
          <p className="animate-pulse-soft text-white/50">加载中…</p>
        )}
        {error && <p className="text-red-300">{error}</p>}

        {mode !== "loading" && !error && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={imageSrc}
              ref={imgRef}
              src={imageSrc}
              alt={title}
              decoding="async"
              className={
                mediaType === "webtoon"
                  ? "w-full max-w-3xl object-contain"
                  : "h-full w-full object-contain"
              }
              onError={() =>
                setError(
                  "图片加载失败。请确认文件为 jpg/png/webp/gif，或从系列列表打开对应图片项。"
                )
              }
            />
            {animated && (
              <span className="absolute left-3 top-3 rounded bg-teal-700/80 px-2 py-0.5 text-[10px] text-white">
                动图 / WebP
              </span>
            )}
            {totalPages > 1 && (
              <>
                <button
                  onClick={() => go(-1)}
                  disabled={currentPage <= 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white hover:bg-black/60 disabled:opacity-30"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={() => go(1)}
                  disabled={currentPage >= totalPages - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white hover:bg-black/60 disabled:opacity-30"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
