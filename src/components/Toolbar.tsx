"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Filter, Star, ArrowUpDown, Play, RotateCcw, Trash2 } from "lucide-react";
import { useLibrary } from "@/lib/store";
import type { SortBy } from "@/lib/types";
import { cn } from "@/lib/utils";

const SORTS: { value: SortBy; label: string }[] = [
  { value: "updated", label: "最近更新" },
  { value: "added", label: "最近添加" },
  { value: "title", label: "标题" },
  { value: "author", label: "作者" },
  { value: "rating", label: "评分" },
  { value: "capture", label: "拍摄日期" },
];

export function Toolbar() {
  const {
    search,
    setSearch,
    sortBy,
    setSortBy,
    tags,
    selectedTagIds,
    setSelectedTagIds,
    tagMatch,
    setTagMatch,
    selectedIds,
    clearSelection,
    mediaType,
    series,
    openBatchSession,
    refresh,
  } = useLibrary();
  const [busy, setBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (search.trim()) setSearchOpen(true);
  }, [search]);

  const toggleTagId = (id: string) => {
    if (selectedTagIds.includes(id)) {
      setSelectedTagIds(selectedTagIds.filter((t) => t !== id));
    } else {
      setSelectedTagIds([...selectedTagIds, id]);
    }
  };

  const selectedOrdered = series.filter((s) => selectedIds.has(s.id)).map((s) => s.id);

  const openContinuous = async () => {
    if (mediaType !== "photo" && mediaType !== "video") return;
    if (!selectedOrdered.length) return;
    setBusy(true);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "batchItems", seriesIds: selectedOrdered }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      const items = (data.items || []).map(
        (i: {
          id: string;
          title: string;
          seriesTitle: string;
          progress: number;
          path?: string;
        }) => ({
          id: i.id,
          title: i.title,
          seriesTitle: i.seriesTitle,
          progress: i.progress || 0,
          path: i.path,
        })
      );
      if (!items.length) return;
      openBatchSession({
        mediaType,
        items,
        currentId: items[0].id,
      });
    } finally {
      setBusy(false);
    }
  };

  const resetProgress = async () => {
    if (mediaType !== "video" || !selectedOrdered.length) return;
    if (!confirm(`将重置已选 ${selectedOrdered.length} 个系列的观看进度？`)) return;
    setBusy(true);
    try {
      await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resetProgress", seriesIds: selectedOrdered }),
        signal: AbortSignal.timeout(15000),
      });
      await refresh();
      clearSelection();
    } finally {
      setBusy(false);
    }
  };

  const removeFromLibrary = async () => {
    if (!selectedOrdered.length) return;
    if (
      !confirm(
        `从库中移除已选 ${selectedOrdered.length} 项？\n（仅删除索引，不会删除磁盘上的源文件）`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteSeries", seriesIds: selectedOrdered }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "移除失败");
        return;
      }
      await refresh();
      clearSelection();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        {searchOpen ? (
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={() => {
                if (!search.trim()) setSearchOpen(false);
              }}
              placeholder="搜索标题或作者…"
              className="w-full rounded-xl border border-[var(--line)] bg-white/70 py-2.5 pl-10 pr-4 text-sm outline-none ring-[var(--accent)] transition focus:ring-2"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white/70 text-[var(--ink-muted)] hover:text-[var(--ink)]"
            title="搜索"
            aria-label="搜索"
          >
            <Search className="h-4 w-4" />
          </button>
        )}

        <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2">
          <ArrowUpDown className="h-4 w-4 text-[var(--ink-faint)]" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="bg-transparent text-sm outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setTagMatch(tagMatch === "all" ? "any" : "all")}
          className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink-muted)]"
          title="标签匹配模式"
        >
          <Filter className="h-4 w-4" />
          标签: {tagMatch === "all" ? "全部匹配" : "任一匹配"}
        </button>

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent)]">
            已选 {selectedIds.size}
            {(mediaType === "photo" || mediaType === "video") && (
              <button
                disabled={busy}
                onClick={openContinuous}
                className="flex items-center gap-1 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs text-white disabled:opacity-50"
              >
                <Play className="h-3 w-3" />
                连续打开
              </button>
            )}
            {mediaType === "video" && (
              <button
                disabled={busy}
                onClick={resetProgress}
                className="flex items-center gap-1 rounded-lg border border-[var(--accent)]/40 bg-white px-2.5 py-1 text-xs disabled:opacity-50"
              >
                <RotateCcw className="h-3 w-3" />
                重置进度
              </button>
            )}
            <button
              disabled={busy}
              onClick={removeFromLibrary}
              className="flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs text-red-600 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              从库移除
            </button>
            <button onClick={clearSelection} className="underline">
              清除
            </button>
          </div>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Star className="h-3.5 w-3.5 text-[var(--ink-faint)]" />
          {tags.map((tag) => {
            const active = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => toggleTagId(tag.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs transition",
                  active
                    ? "text-white shadow-sm"
                    : "bg-white text-[var(--ink-muted)] border border-[var(--line)] hover:border-[var(--accent)]"
                )}
                style={active ? { backgroundColor: tag.color } : undefined}
              >
                {tag.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
