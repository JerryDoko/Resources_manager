"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Play, Pause, FolderOpen, MoveHorizontal } from "lucide-react";
import { FullscreenPortal } from "./FullscreenPortal";
import { useAppChrome } from "@/lib/useAppChrome";

export interface MangaPageItem {
  id: string;
  title: string;
  path?: string;
}

interface Props {
  itemId: string;
  title: string;
  mediaType: string;
  itemPath?: string;
  onClose: () => void;
  /** 同系列图片项，用于文件夹漫画连续翻页 / 放映 */
  playlist?: MangaPageItem[];
  onChangeItem?: (id: string) => void;
  onProgressChange?: (itemId: string, progress: number) => void;
}

const IMAGE_PAGE_RE = /\.(jpe?g|png|webp|gif|avif|apng|bmp)$/i;
const ANIMATED_RE = /\.(gif|apng)$/i;

function isLikelyAnimated(nameOrPath: string): boolean {
  return ANIMATED_RE.test(nameOrPath);
}

export function MangaReader({
  itemId,
  title,
  mediaType,
  itemPath,
  onClose,
  playlist = [],
  onChangeItem,
  onProgressChange,
}: Props) {
  const [archivePages, setArchivePages] = useState<string[]>([]);
  const [archiveIndex, setArchiveIndex] = useState(0);
  const [mode, setMode] = useState<"archive" | "playlist" | "single" | "loading">(
    "loading"
  );
  const [error, setError] = useState<string | null>(null);
  const [slideshow, setSlideshow] = useState(false);
  const [intervalSec, setIntervalSec] = useState(3);
  const [imgReady, setImgReady] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [webtoonWidth, setWebtoonWidth] = useState(50);
  const [continuousIndex, setContinuousIndex] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const continuousRefs = useRef(new Map<number, HTMLImageElement>());
  const continuousScrollRaf = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | 0>(0);
  const progressSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const lastSavedProgress = useRef("");
  const { viewerHeaderClass } = useAppChrome();

  const imagePlaylist = useMemo(
    () => playlist.filter((p) => !p.path || IMAGE_PAGE_RE.test(p.path)),
    [playlist]
  );

  const playlistIndex = imagePlaylist.findIndex((p) => p.id === itemId);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem("resources-manager:webtoon-width"));
    if (Number.isFinite(saved) && saved >= 20 && saved <= 100) setWebtoonWidth(saved);
  }, []);

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
            setContinuousIndex(0);
            return;
          }
        }
      } catch {
        /* fall through */
      }

      if (cancelled) return;

      if (imagePlaylist.length > 1 && playlistIndex >= 0) {
        setMode("playlist");
        setContinuousIndex(Math.max(0, playlistIndex));
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
        : mode === "loading"
          ? 0
          : 1;

  const continuous =
    mediaType === "webtoon" && totalPages > 0 && mode !== "loading";

  const currentPage =
    continuous
      ? continuousIndex
      : mode === "archive"
      ? archiveIndex
      : mode === "playlist"
        ? Math.max(0, playlistIndex)
        : 0;

  const currentName =
    mode === "archive"
      ? archivePages[continuous ? continuousIndex : archiveIndex] || ""
      : mode === "playlist"
        ? imagePlaylist[continuous ? continuousIndex : playlistIndex]?.path ||
          imagePlaylist[continuous ? continuousIndex : playlistIndex]?.title ||
          ""
        : title;

  const animated = isLikelyAnimated(currentName);
  const currentPath =
    mode === "playlist"
      ? imagePlaylist[continuous ? continuousIndex : playlistIndex]?.path || itemPath
      : itemPath;

  const imageSrc =
    mode === "archive"
      ? `/api/media/${itemId}?mode=page&i=${archiveIndex}`
      : `/api/media/${itemId}`;

  const continuousSources = useMemo(() => {
    if (!continuous) return [];
    if (mode === "archive") {
      return archivePages.map((name, index) => ({
        key: `${itemId}:${index}`,
        src: `/api/media/${itemId}?mode=page&i=${index}`,
        alt: name,
      }));
    }
    if (mode === "playlist") {
      return imagePlaylist.map((item) => ({
        key: item.id,
        src: `/api/media/${item.id}`,
        alt: item.title,
      }));
    }
    return [{ key: itemId, src: `/api/media/${itemId}`, alt: title }];
  }, [archivePages, continuous, imagePlaylist, itemId, mode, title]);

  const go = useCallback(
    (delta: number) => {
      if (continuous) {
        const next = Math.max(0, Math.min(totalPages - 1, continuousIndex + delta));
        setContinuousIndex(next);
        continuousRefs.current
          .get(next)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
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
      continuous,
      continuousIndex,
      totalPages,
    ]
  );

  useEffect(() => {
    if (!slideshow || !imgReady) return;
    const delay = Math.max(125, Math.round(intervalSec * 1000));
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
    imgReady,
    intervalSec,
    mode,
    archiveIndex,
    archivePages.length,
    playlistIndex,
    imagePlaylist.length,
    go,
  ]);

  useEffect(() => {
    setImgReady(false);
    const id = requestAnimationFrame(() => {
      const img = imgRef.current;
      if (img && img.complete && img.naturalWidth > 0) {
        setImgReady(true);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [imageSrc]);

  const bumpChrome = useCallback(() => {
    setChromeVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChromeVisible(false), 2500);
  }, []);

  const closeReader = useCallback(async () => {
    await progressSaveQueue.current.catch(() => {});
    onClose();
  }, [onClose]);

  useEffect(() => {
    bumpChrome();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [bumpChrome, currentPage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void closeReader();
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(1);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
      if (e.key.toLowerCase() === "p") setSlideshow((s) => !s);
      bumpChrome();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, closeReader, bumpChrome]);

  const progressIndex = continuous ? continuousIndex : currentPage;
  const progressItemId =
    continuous && mode === "playlist"
      ? imagePlaylist[continuousIndex]?.id || itemId
      : itemId;
  const progress =
    mode === "single" ? 1 : (progressIndex + 1) / Math.max(1, totalPages);

  useEffect(() => {
    if (totalPages <= 0) return;
    const progressKey = `${progressItemId}:${progress}`;
    if (lastSavedProgress.current === progressKey) return;
    lastSavedProgress.current = progressKey;

    onProgressChange?.(progressItemId, progress);
    progressSaveQueue.current = progressSaveQueue.current
      .catch(() => {})
      .then(async () => {
        await fetch("/api/items", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "progress",
            id: progressItemId,
            progress,
          }),
          signal: AbortSignal.timeout(10000),
        });
      });
  }, [
    onProgressChange,
    progress,
    progressItemId,
    totalPages,
  ]);

  useEffect(() => {
    if (!continuous) return;
    const frame = requestAnimationFrame(() => {
      continuousRefs.current
        .get(continuousIndex)
        ?.scrollIntoView({ block: "start", behavior: "auto" });
    });
    return () => cancelAnimationFrame(frame);
    // Only restore the selected image when the continuous document is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continuous, itemId, mode]);

  useEffect(
    () => () => {
      if (continuousScrollRaf.current) {
        cancelAnimationFrame(continuousScrollRaf.current);
      }
    },
    []
  );

  const trackContinuousScroll = useCallback(
    (container: HTMLDivElement) => {
      if (!continuous) return;
      if (continuousScrollRaf.current) {
        cancelAnimationFrame(continuousScrollRaf.current);
      }
      continuousScrollRaf.current = requestAnimationFrame(() => {
        const marker =
          container.getBoundingClientRect().top + container.clientHeight * 0.35;
        let nearest = continuousIndex;
        let distance = Number.POSITIVE_INFINITY;
        for (const [index, image] of continuousRefs.current) {
          const nextDistance = Math.abs(image.getBoundingClientRect().top - marker);
          if (nextDistance < distance) {
            distance = nextDistance;
            nearest = index;
          }
        }
        setContinuousIndex(nearest);
      });
    },
    [continuous, continuousIndex]
  );

  const pageText =
    mode === "loading"
      ? "…"
      : totalPages > 0
        ? `${currentPage + 1} / ${totalPages}`
        : "—";

  const revealCurrentImage = useCallback(async () => {
    if (!currentPath) return;
    if (window.rmDesktop?.revealItem) {
      await window.rmDesktop.revealItem(currentPath);
      return;
    }
    await fetch("/api/system/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: currentPath }),
      signal: AbortSignal.timeout(10000),
    });
  }, [currentPath]);

  return (
    <FullscreenPortal className="fixed inset-0 z-[300] flex flex-col bg-[#0f1415] animate-viewer-in">
      <header
        className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-white/90 transition-opacity ${viewerHeaderClass} ${
          chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="text-xs text-white/50">
            {pageText}
            {animated ? " · 动图" : ""}
            {slideshow ? " · 放映中" : ""}
            {" · ←/→ 翻页 · P 放映 · Esc 关闭"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mediaType === "webtoon" && (
            <label
              className="flex items-center gap-2 text-xs text-white/60"
              title="调整条漫宽度"
            >
              <MoveHorizontal className="h-4 w-4" />
              <input
                type="range"
                min={20}
                max={100}
                step={5}
                value={webtoonWidth}
                onChange={(event) => {
                  const width = Number(event.target.value);
                  setWebtoonWidth(width);
                  window.localStorage.setItem("resources-manager:webtoon-width", String(width));
                }}
                className="w-28 accent-[var(--accent)]"
                aria-label="条漫宽度"
              />
              <span className="w-9 text-right tabular-nums">{webtoonWidth}%</span>
            </label>
          )}
          {currentPath && (
            <button
              type="button"
              onClick={revealCurrentImage}
              className="rounded-lg p-2 hover:bg-white/10"
              title="在访达/文件夹中显示"
              aria-label="在访达或文件夹中显示当前图片"
            >
              <FolderOpen className="h-5 w-5" />
            </button>
          )}
          {!continuous && (mode === "archive" || mode === "playlist") && totalPages > 1 && (
            <>
              <label className="flex items-center gap-1 text-xs text-white/50">
                间隔
                <select
                  value={String(intervalSec)}
                  onChange={(e) => setIntervalSec(Number(e.target.value))}
                  className="rounded border border-white/20 bg-black/40 px-1.5 py-0.5 text-white"
                >
                  {[0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 8, 10].map((s) => (
                    <option key={s} value={s}>
                      {s}s
                    </option>
                  ))}
                </select>
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
          <button
            onClick={() => void closeReader()}
            className="rounded-lg p-2 hover:bg-white/10"
            aria-label="关闭图片查看器"
          >
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
        onMouseMove={bumpChrome}
        onClick={bumpChrome}
        onScroll={(event) => trackContinuousScroll(event.currentTarget)}
      >
        {mode === "loading" && (
          <p className="animate-pulse-soft text-white/50">加载中…</p>
        )}
        {error && <p className="text-red-300">{error}</p>}

        {mode !== "loading" && !error && (
          <>
            {continuous ? (
              <div
                className="mx-auto shrink-0 self-start bg-black"
                style={{ width: `${webtoonWidth}%` }}
              >
                {continuousSources.map((page, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={page.key}
                    ref={(element) => {
                      if (element) continuousRefs.current.set(index, element);
                      else continuousRefs.current.delete(index);
                    }}
                    src={page.src}
                    alt={page.alt}
                    loading={Math.abs(index - continuousIndex) <= 2 ? "eager" : "lazy"}
                    decoding="async"
                    className="block h-auto w-full object-contain"
                    onLoad={() => setImgReady(true)}
                  />
                ))}
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={imageSrc}
                ref={imgRef}
                src={imageSrc}
                alt={title}
                decoding="async"
                className="h-full w-full object-contain"
                onLoad={() => setImgReady(true)}
                onError={() =>
                  setError(
                    "图片加载失败。请确认文件为 jpg/png/webp/gif，或从系列列表打开对应图片项。"
                  )
                }
              />
            )}
            {totalPages > 1 && (
              <>
                <button
                  onClick={() => go(-1)}
                  disabled={currentPage <= 0}
                  className={`absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white hover:bg-black/60 disabled:opacity-30 transition-opacity ${
                    chromeVisible ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={() => go(1)}
                  disabled={currentPage >= totalPages - 1}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white hover:bg-black/60 disabled:opacity-30 transition-opacity ${
                    chromeVisible ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </>
        )}

        {mode !== "loading" && totalPages > 0 && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/65 px-4 py-1.5 text-sm font-medium tabular-nums tracking-wide text-white shadow-lg backdrop-blur-sm">
            {pageText}
            {slideshow ? " · 放映" : ""}
          </div>
        )}
      </div>
    </FullscreenPortal>
  );
}
