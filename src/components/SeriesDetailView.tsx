"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Star,
  Play,
  BookOpen,
  Music2,
  Image as ImageIcon,
  Trash2,
  FolderOpen,
} from "lucide-react";
import { useLibrary } from "@/lib/store";
import { MEDIA_TYPE_LABELS, type MediaType } from "@/lib/types";
import { cn, formatBytes, formatDate, formatDuration } from "@/lib/utils";
import { MangaReader } from "@/components/viewers/MangaReader";
import { VideoPlayer } from "@/components/viewers/VideoPlayer";
import { NovelReader } from "@/components/viewers/NovelReader";

interface SeriesDetail {
  id: string;
  title: string;
  author: string | null;
  mediaType: string;
  rating: number;
  itemCount: number;
  progress: number;
  thumbnailPath: string | null;
  captureDate: string | null;
  createdAt: number;
  updatedAt: number;
  items: {
    id: string;
    title: string;
    path: string;
    sortOrder: number;
    duration: number | null;
    fileSize: number;
    progress: number;
    metadata: string | null;
    captureDate: string | null;
    createdAt: number;
    updatedAt: number;
  }[];
  tags: { id: string; name: string; color: string }[];
}

interface SeriesDetailViewProps {
  seriesId: string;
  tabId: string;
  isActive: boolean;
  onBack: () => void;
  onRemoved: () => void;
}

export function SeriesDetailView({
  seriesId,
  tabId,
  isActive,
  onBack,
  onRemoved,
}: SeriesDetailViewProps) {
  const { tags, refresh, refreshTags, setMusicQueue, updateTabMeta } = useLibrary();
  const [data, setData] = useState<SeriesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerItemId, setViewerItemId] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/library/${seriesId}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        setData(null);
        return;
      }
      const json = (await res.json()) as SeriesDetail;
      setData(json);
      setThumbFailed(false);
      updateTabMeta(tabId, {
        title: json.title,
        mediaType: json.mediaType,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId]);

  // 切走标签时关闭播放器，避免与其它页叠层
  useEffect(() => {
    if (!isActive) setViewerItemId(null);
  }, [isActive]);

  const setRating = async (rating: number) => {
    await fetch(`/api/library/${seriesId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
      signal: AbortSignal.timeout(10000),
    });
    setData((d) => (d ? { ...d, rating } : d));
    refresh();
  };

  const toggleTag = async (tagId: string) => {
    if (!data) return;
    const has = data.tags.some((t) => t.id === tagId);
    const next = has
      ? data.tags.filter((t) => t.id !== tagId).map((t) => t.id)
      : [...data.tags.map((t) => t.id), tagId];
    const res = await fetch(`/api/library/${seriesId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagIds: next }),
      signal: AbortSignal.timeout(10000),
    });
    setData(await res.json());
    refresh();
  };

  const createAndApplyTag = async () => {
    const name = prompt("新标签名称");
    if (!name) return;
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name }),
      signal: AbortSignal.timeout(10000),
    });
    const { tag } = await res.json();
    await refreshTags();
    if (tag) await toggleTag(tag.id);
  };

  const removeSeries = async () => {
    if (!confirm("从库中移除此系列？（不会删除磁盘文件）")) return;
    await fetch(`/api/library/${seriesId}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(10000),
    });
    refresh();
    onRemoved();
  };

  const openItem = (item: SeriesDetail["items"][0]) => {
    if (!data) return;
    if (data.mediaType === "music") {
      let artist: string | undefined;
      try {
        artist = item.metadata ? JSON.parse(item.metadata).artist : undefined;
      } catch {
        /* */
      }
      setMusicQueue({ id: item.id, title: item.title, artist });
      return;
    }
    setViewerItemId(item.id);
  };

  const viewerItem = data?.items.find((i) => i.id === viewerItemId);
  const totalSize = data?.items.reduce((s, i) => s + (i.fileSize || 0), 0) ?? 0;
  const typeLabel =
    MEDIA_TYPE_LABELS[(data?.mediaType as MediaType) || "manga"] || data?.mediaType;

  // 播放器独占：不与详情页 DOM 并存，避免叠层
  if (isActive && viewerItem && data) {
    if (
      data.mediaType === "manga" ||
      data.mediaType === "webtoon" ||
      data.mediaType === "photo"
    ) {
      return (
        <MangaReader
          itemId={viewerItem.id}
          title={viewerItem.title}
          mediaType={data.mediaType === "webtoon" ? "webtoon" : "manga"}
          playlist={data.items.map((i) => ({
            id: i.id,
            title: i.title,
            path: i.path,
          }))}
          onChangeItem={setViewerItemId}
          onClose={() => setViewerItemId(null)}
        />
      );
    }
    if (data.mediaType === "video") {
      return (
        <VideoPlayer
          itemId={viewerItem.id}
          title={viewerItem.title}
          initialProgress={viewerItem.progress}
          playlist={data.items.map((i) => ({
            id: i.id,
            title: i.title,
            progress: i.progress,
          }))}
          onChangeItem={setViewerItemId}
          onClose={() => setViewerItemId(null)}
          onThumbnailUpdated={() => {
            load();
            refresh();
          }}
        />
      );
    }
    if (data.mediaType === "novel") {
      return (
        <NovelReader
          itemId={viewerItem.id}
          title={viewerItem.title}
          onClose={() => setViewerItemId(null)}
        />
      );
    }
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-[var(--line)] bg-[#f7f9f8]/80">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回库
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {loading ? "加载中…" : data?.title || "未找到"}
            </p>
            <p className="text-xs text-[var(--ink-faint)]">{typeLabel}</p>
          </div>
          {data && (
            <button
              onClick={removeSeries}
              className="rounded-xl p-2 text-[var(--ink-faint)] hover:bg-red-50 hover:text-red-600"
              title="从库中移除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {!loading && !data && (
        <div className="mx-auto max-w-lg px-5 py-24 text-center">
          <h1 className="text-display text-2xl font-semibold">系列不存在</h1>
          <button
            onClick={onBack}
            className="mt-4 text-sm text-[var(--accent)] underline"
          >
            返回首页
          </button>
        </div>
      )}

      {data && (
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4 animate-fade-up">
            <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-lg shadow-teal-900/5">
              <div className="relative aspect-[3/4] bg-[#152022]">
                {!thumbFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/thumbnails/${data.id}?t=${data.updatedAt}`}
                    alt={data.title}
                    className="h-full w-full object-cover"
                    onError={() => setThumbFailed(true)}
                  />
                ) : (
                  <div className="flex h-full items-end p-5">
                    <span className="text-display text-2xl text-white/90">{data.title}</span>
                  </div>
                )}
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <h1 className="text-display text-xl font-semibold leading-snug">
                    {data.title}
                  </h1>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">
                    {data.author || "未知作者"}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--ink-faint)]">
                    {typeLabel} · {formatBytes(totalSize)} · {data.itemCount} 项
                  </p>
                </div>

                <div>
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-faint)]">
                    评分
                  </p>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <button key={i} onClick={() => setRating(i + 1)}>
                        <Star
                          className={cn(
                            "h-5 w-5 transition",
                            i < data.rating
                              ? "fill-[var(--accent-hot)] text-[var(--accent-hot)]"
                              : "text-[#cfd8d6] hover:text-[var(--accent-hot)]"
                          )}
                        />
                      </button>
                    ))}
                    {data.rating > 0 && (
                      <button
                        onClick={() => setRating(0)}
                        className="ml-2 text-xs text-[var(--ink-faint)] underline"
                      >
                        清除
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-[var(--bg)] px-3 py-2.5 text-xs text-[var(--ink-muted)]">
                  <p className="mb-2 flex items-center gap-1.5 font-medium text-[var(--ink)]">
                    <FolderOpen className="h-3.5 w-3.5" />
                    信息
                  </p>
                  <dl className="space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--ink-faint)]">添加时间</dt>
                      <dd>{formatDate(data.createdAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--ink-faint)]">更新时间</dt>
                      <dd>{formatDate(data.updatedAt)}</dd>
                    </div>
                    {data.captureDate && data.mediaType === "video" && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--ink-faint)]">拍摄日期</dt>
                        <dd>{formatDate(data.captureDate)}</dd>
                      </div>
                    )}
                    {data.mediaType === "video" && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-[var(--ink-faint)]">进度</dt>
                        <dd>{Math.round(data.progress * 100)}%</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            </div>
          </aside>

          <section className="min-w-0 space-y-6 animate-fade-up" style={{ animationDelay: "60ms" }}>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">标签</h2>
                <button
                  onClick={createAndApplyTag}
                  className="text-xs text-[var(--accent)] underline"
                >
                  + 新建标签
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const active = data.tags.some((t) => t.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs transition",
                        active
                          ? "text-white"
                          : "border border-[var(--line)] bg-white text-[var(--ink-muted)]"
                      )}
                      style={active ? { backgroundColor: tag.color } : undefined}
                    >
                      {tag.name}
                    </button>
                  );
                })}
                {tags.length === 0 && (
                  <span className="text-xs text-[var(--ink-faint)]">暂无标签</span>
                )}
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-sm font-semibold">内容列表 · {data.items.length}</h2>
              <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
                {data.items.map((item, idx) => (
                  <li key={item.id}>
                    <button
                      onClick={() => openItem(item)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--bg)]"
                    >
                      <div
                        className={cn(
                          "relative shrink-0 overflow-hidden rounded-lg bg-[var(--accent-soft)]",
                          data.mediaType === "video" ? "h-14 w-24" : "h-12 w-10"
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/thumbnails/item/${item.id}?t=${item.updatedAt}`}
                          alt=""
                          className="absolute inset-0 z-[1] h-full w-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                        <span className="absolute inset-0 z-0 flex items-center justify-center text-[var(--accent)]">
                          {data.mediaType === "video" ? (
                            <Play className="h-4 w-4" />
                          ) : data.mediaType === "music" ? (
                            <Music2 className="h-4 w-4" />
                          ) : data.mediaType === "photo" ? (
                            <ImageIcon className="h-4 w-4" />
                          ) : (
                            <BookOpen className="h-4 w-4" />
                          )}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {idx + 1}. {item.title}
                        </p>
                        <p className="truncate text-xs text-[var(--ink-faint)]" title={item.path}>
                          {formatBytes(item.fileSize)}
                          {item.duration != null && ` · ${formatDuration(item.duration)}`}
                          {data.mediaType === "video" &&
                            item.progress > 0 &&
                            ` · ${Math.round(item.progress * 100)}%`}
                          {" · "}
                          {item.path}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
                {data.items.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-[var(--ink-faint)]">
                    暂无内容项
                  </li>
                )}
              </ul>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
