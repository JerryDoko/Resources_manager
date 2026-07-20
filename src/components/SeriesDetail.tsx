"use client";

import { useEffect, useState } from "react";
import { X, Star, Play, BookOpen, Music2, Image as ImageIcon } from "lucide-react";
import { useLibrary } from "@/lib/store";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { MangaReader } from "./viewers/MangaReader";
import { VideoPlayer } from "./viewers/VideoPlayer";
import { NovelReader } from "./viewers/NovelReader";
import { PhotoViewer } from "./viewers/PhotoViewer";

interface SeriesDetail {
  id: string;
  title: string;
  author: string | null;
  mediaType: string;
  rating: number;
  itemCount: number;
  progress: number;
  items: {
    id: string;
    title: string;
    path: string;
    sortOrder: number;
    duration: number | null;
    fileSize: number;
    progress: number;
    metadata: string | null;
  }[];
  tags: { id: string; name: string; color: string }[];
}

export function SeriesDetailModal() {
  const {
    activeSeriesId,
    setActiveSeriesId,
    tags,
    refresh,
    refreshTags,
    setMusicQueue,
  } = useLibrary();
  const [data, setData] = useState<SeriesDetail | null>(null);
  const [viewerItemId, setViewerItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeSeriesId) {
      setData(null);
      setViewerItemId(null);
      return;
    }
    setLoading(true);
    fetch(`/api/library/${activeSeriesId}`, { signal: AbortSignal.timeout(10000) })
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [activeSeriesId]);

  if (!activeSeriesId) return null;

  const setRating = async (rating: number) => {
    await fetch(`/api/library/${activeSeriesId}`, {
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
    const res = await fetch(`/api/library/${activeSeriesId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagIds: next }),
      signal: AbortSignal.timeout(10000),
    });
    const updated = await res.json();
    setData(updated);
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

  const openItem = (item: SeriesDetail["items"][0]) => {
    if (data?.mediaType === "music") {
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

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40 backdrop-blur-sm animate-fade-up">
      <button className="flex-1" onClick={() => setActiveSeriesId(null)} aria-label="关闭" />
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-[var(--line)] bg-[#f7f9f8] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-display text-2xl font-semibold leading-tight">
              {loading ? "加载中…" : data?.title}
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              {data?.author || "未知作者"} · {data?.itemCount} 项
            </p>
          </div>
          <button
            onClick={() => setActiveSeriesId(null)}
            className="rounded-lg p-2 text-[var(--ink-muted)] hover:bg-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {data && (
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="space-y-4 px-5 py-4">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--ink-faint)]">
                  评分
                </p>
                <div className="flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <button key={i} onClick={() => setRating(i + 1)}>
                      <Star
                        className={cn(
                          "h-6 w-6 transition",
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

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--ink-faint)]">
                    标签
                  </p>
                  <button
                    onClick={createAndApplyTag}
                    className="text-xs text-[var(--accent)] underline"
                  >
                    + 新建
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
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--ink-faint)]">
                  内容列表
                </p>
                <ul className="space-y-1">
                  {data.items.map((item, idx) => (
                    <li key={item.id}>
                      <button
                        onClick={() => openItem(item)}
                        className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-[var(--line)] hover:bg-white"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
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
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {idx + 1}. {item.title}
                          </p>
                          <p className="text-xs text-[var(--ink-faint)]">
                            {formatBytes(item.fileSize)}
                            {item.duration != null && ` · ${formatDuration(item.duration)}`}
                            {item.progress > 0 &&
                              ` · ${Math.round(item.progress * 100)}%`}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </aside>

      {viewerItem && data && (
        <>
          {(data.mediaType === "manga" || data.mediaType === "webtoon") && (
            <MangaReader
              itemId={viewerItem.id}
              title={viewerItem.title}
              mediaType={data.mediaType}
              playlist={data.items.map((i) => ({
                id: i.id,
                title: i.title,
                path: i.path,
              }))}
              onChangeItem={setViewerItemId}
              onClose={() => setViewerItemId(null)}
            />
          )}
          {data.mediaType === "video" && (
            <VideoPlayer
              itemId={viewerItem.id}
              title={viewerItem.title}
              playlist={data.items.map((i) => ({ id: i.id, title: i.title }))}
              onChangeItem={setViewerItemId}
              onClose={() => setViewerItemId(null)}
            />
          )}
          {data.mediaType === "novel" && (
            <NovelReader
              itemId={viewerItem.id}
              title={viewerItem.title}
              onClose={() => setViewerItemId(null)}
            />
          )}
          {data.mediaType === "photo" && (
            <PhotoViewer
              items={data.items}
              currentId={viewerItem.id}
              onClose={() => setViewerItemId(null)}
              onNavigate={setViewerItemId}
            />
          )}
        </>
      )}
    </div>
  );
}
