"use client";

import { useState } from "react";
import { Star, Check } from "lucide-react";
import { useRouter } from "next/navigation";
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

function SeriesThumb({ series }: { series: SeriesCard }) {
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
          className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
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
      {series.progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
          <div
            className="h-full bg-[var(--accent-hot)]"
            style={{ width: `${Math.min(100, series.progress * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function SeriesGrid() {
  const router = useRouter();
  const { series, loading, selectedIds, toggleSelect, mediaType } = useLibrary();

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

  return (
    <div className="mx-auto grid max-w-[1600px] grid-cols-2 gap-4 px-5 pb-28 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {series.map((s, idx) => {
        const selected = selectedIds.has(s.id);
        return (
          <article
            key={s.id}
            className={cn(
              "group relative cursor-pointer overflow-hidden rounded-[14px] border bg-white transition-all animate-fade-up",
              selected
                ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30"
                : "border-[var(--line)] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-teal-900/5"
            )}
            style={{ animationDelay: `${Math.min(idx, 20) * 30}ms` }}
            onClick={() => router.push(`/series/${s.id}`)}
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

            <SeriesThumb series={s} />

            <div className="space-y-1.5 p-3">
              <h3 className="line-clamp-2 text-sm font-medium leading-snug">{s.title}</h3>
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
    </div>
  );
}
