"use client";

import { useCallback, useRef, useState } from "react";
import { Star, Check } from "lucide-react";
import { useLibrary, type SeriesCard } from "@/lib/store";
import { cn, formatDate } from "@/lib/utils";

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3 w-3",
            i < rating
              ? "fill-[var(--accent-hot)] text-[var(--accent-hot)]"
              : "text-[#cfd8d6]"
          )}
        />
      ))}
    </div>
  );
}

function SeriesThumb({ series, mediaType }: { series: SeriesCard; mediaType: string }) {
  const [failed, setFailed] = useState(false);
  const hues = ["#1f6f6a", "#2d4a6f", "#6f4a2d", "#4a6f3a", "#6f2d4a", "#3a4a6f"];
  const hue = hues[(series.title.charCodeAt(0) || 0) % hues.length];
  const src = `/api/thumbnails/${series.id}`;

  return (
    <div
      className="relative aspect-[3/4] w-full overflow-hidden rounded-t-[12px]"
      style={{
        background: `linear-gradient(145deg, ${hue} 0%, #152022 100%)`,
      }}
    >
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={series.title}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-transparent to-transparent p-3">
          <span className="text-display text-lg font-medium leading-tight text-white/90 line-clamp-3">
            {series.title}
          </span>
        </div>
      )}
      {mediaType === "video" && (
        <>
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/40">
            <div
              className="h-full bg-[var(--accent-hot)] transition-all"
              style={{ width: `${Math.min(100, series.progress * 100)}%` }}
            />
          </div>
          {series.progress > 0 && (
            <span className="absolute bottom-2 right-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {Math.round(series.progress * 100)}%
            </span>
          )}
        </>
      )}
    </div>
  );
}

type DragBox = { x0: number; y0: number; x1: number; y1: number };

function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

export function SeriesGrid() {
  const {
    series,
    loading,
    selectedIds,
    toggleSelect,
    setSelectedIds,
    clearSelection,
    mediaType,
    openSeriesTab,
    libraryViewMode,
  } = useLibrary();
  const gridRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [drag, setDrag] = useState<DragBox | null>(null);
  const dragStart = useRef<{ x: number; y: number; additive: boolean } | null>(null);
  const didDrag = useRef(false);

  const onGridMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      // 点在卡片上不启动框选
      if ((e.target as HTMLElement).closest("[data-series-card]")) return;
      didDrag.current = false;
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        additive: e.metaKey || e.ctrlKey || e.shiftKey,
      };
      setDrag({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY });

      const onMove = (ev: MouseEvent) => {
        if (!dragStart.current) return;
        const dx = Math.abs(ev.clientX - dragStart.current.x);
        const dy = Math.abs(ev.clientY - dragStart.current.y);
        if (dx > 4 || dy > 4) didDrag.current = true;
        setDrag({
          x0: dragStart.current.x,
          y0: dragStart.current.y,
          x1: ev.clientX,
          y1: ev.clientY,
        });
      };

      const onUp = (ev: MouseEvent) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const start = dragStart.current;
        dragStart.current = null;
        setDrag(null);
        if (!start) return;

        // 点空白（未拖拽）：退出多选
        if (!didDrag.current) {
          if (!start.additive) clearSelection();
          return;
        }

        const box = {
          left: Math.min(start.x, ev.clientX),
          top: Math.min(start.y, ev.clientY),
          right: Math.max(start.x, ev.clientX),
          bottom: Math.max(start.y, ev.clientY),
        };

        const hit = new Set<string>();
        for (const [id, el] of cardRefs.current) {
          const r = el.getBoundingClientRect();
          if (
            rectsIntersect(box, {
              left: r.left,
              top: r.top,
              right: r.right,
              bottom: r.bottom,
            })
          ) {
            hit.add(id);
          }
        }

        if (start.additive) {
          setSelectedIds(new Set([...selectedIds, ...hit]));
        } else {
          setSelectedIds(hit);
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [selectedIds, setSelectedIds, clearSelection]
  );

  if (loading) {
    return (
      <div className="mx-auto grid max-w-[1600px] grid-cols-2 gap-4 px-5 pb-28 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse-soft aspect-[3/4] rounded-[14px] bg-white/60"
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
    );
  }

  if (series.length === 0) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center px-5 py-24 text-center animate-fade-up">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)] text-display text-2xl font-semibold">
          RM
        </div>
        <h2 className="text-display text-2xl font-semibold">还没有内容</h2>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          打开右上角设置，用访达选择本地文件夹并扫描。支持按 [作者] 标题
          自动解析，并按系列分组。
        </p>
      </div>
    );
  }

  const boxStyle = drag
    ? {
        left: Math.min(drag.x0, drag.x1),
        top: Math.min(drag.y0, drag.y1),
        width: Math.abs(drag.x1 - drag.x0),
        height: Math.abs(drag.y1 - drag.y0),
      }
    : null;

  return (
    <div
      ref={gridRef}
      className="relative mx-auto grid min-h-full max-w-[1600px] grid-cols-2 content-start gap-4 px-5 pb-28 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 select-none"
      onMouseDown={onGridMouseDown}
    >
      {series.map((s, idx) => {
        const selected = selectedIds.has(s.id);
        return (
          <article
            key={s.id}
            data-series-card
            ref={(el) => {
              if (el) cardRefs.current.set(s.id, el);
              else cardRefs.current.delete(s.id);
            }}
            className={cn(
              "group relative cursor-pointer overflow-hidden rounded-2xl border transition-[border-color,box-shadow] animate-fade-up glass",
              selected
                ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/25 shadow-lg shadow-violet-500/10"
                : "border-[var(--line)] hover:border-[var(--accent)]/30 hover:shadow-md"
            )}
            style={{ animationDelay: `${Math.min(idx, 20) * 30}ms` }}
            onClick={(e) => {
              if (didDrag.current) return;
              if (e.metaKey || e.ctrlKey) {
                toggleSelect(s.id);
                return;
              }
              openSeriesTab({
                seriesId: s.id,
                title: s.title,
                mediaType: s.mediaType,
              });
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              toggleSelect(s.id);
            }}
          >
            <button
              className={cn(
                "absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition",
                selected
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-white/50 bg-black/20 text-transparent opacity-0 group-hover:opacity-100"
              )}
              onClick={(e) => {
                e.stopPropagation();
                toggleSelect(s.id);
              }}
            >
              <Check className="h-3.5 w-3.5" />
            </button>

            <SeriesThumb series={s} mediaType={mediaType} />

            <div className="space-y-1.5 p-3">
              <h3 className="line-clamp-2 text-sm font-medium leading-snug">{s.title}</h3>
              {libraryViewMode === "series" && s.folderPath && (
                <p
                  className="truncate text-[10px] text-[var(--ink-faint)]"
                  title={s.folderPath}
                >
                  {s.folderPath}
                </p>
              )}
              <p className="truncate text-xs text-[var(--ink-muted)]">
                {s.author || "未知作者"} · {s.itemCount}{" "}
                {mediaType === "music"
                  ? "首"
                  : mediaType === "video" || mediaType === "photo"
                    ? "个"
                    : "话"}
              </p>
              <div className="flex items-center justify-between">
                <RatingStars rating={s.rating} />
                <span className="text-[10px] text-[var(--ink-faint)]">
                  {s.captureDate ? formatDate(s.captureDate) : formatDate(s.updatedAt)}
                </span>
              </div>
              {s.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {s.tags.slice(0, 3).map((t) => (
                    <span
                      key={t.id}
                      className="rounded-full px-1.5 py-0.5 text-[10px] text-white"
                      style={{ backgroundColor: t.color }}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </article>
        );
      })}

      {boxStyle && (
        <div
          className="pointer-events-none fixed z-50 border border-[var(--accent)] bg-[var(--accent)]/15"
          style={boxStyle}
        />
      )}
    </div>
  );
}
