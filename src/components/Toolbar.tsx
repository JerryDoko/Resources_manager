"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Search,
  Filter,
  ChevronDown,
  ArrowUpDown,
  Play,
  RotateCcw,
  Trash2,
  Lock,
  LockOpen,
} from "lucide-react";
import { useLibrary } from "@/lib/store";
import type { SortBy } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NovelImportPanel } from "./NovelImportPanel";
import { CategorizedTags } from "./CategorizedTags";
import { groupTags } from "@/lib/tag-groups";

const SORTS: { value: SortBy; label: string }[] = [
  { value: "title", label: "名称" },
  { value: "updated", label: "最近更新" },
  { value: "added", label: "最近添加" },
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
    sortLocked,
    setSortLocked,
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
  const [tagsOpen, setTagsOpen] = useState(false);
  const [allTagsVisible, setAllTagsVisible] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const tagPanelId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTagsOpen(false);
    setAllTagsVisible(false);
    setTagSearch("");
  }, [mediaType]);

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
  const visibleTags = tags.filter((tag) => tag.name.toLocaleLowerCase().includes(tagSearch.trim().toLocaleLowerCase()));
  const hasMoreTags = groupTags(visibleTags).some((group) => group.tags.length > 5);

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
    if (!["video","novel"].includes(mediaType) || !selectedOrdered.length) return;
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
        {mediaType === "novel" && <NovelImportPanel />}
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

        <div className="flex h-10 items-center rounded-xl border border-[var(--line)] bg-white pl-3">
          <ArrowUpDown className="h-4 w-4 text-[var(--ink-faint)]" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="h-full bg-transparent px-2 text-sm outline-none"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortLocked(!sortLocked)}
            className={cn(
              "flex h-full w-9 items-center justify-center border-l border-[var(--line)] transition",
              sortLocked
                ? "text-[var(--accent)]"
                : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
            )}
            title={sortLocked ? "已锁定排序，点击取消" : "锁定当前排序"}
            aria-label={sortLocked ? "取消锁定资源库排序" : "锁定资源库排序"}
            aria-pressed={sortLocked}
          >
            {sortLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            setTagsOpen((open) => !open);
            setAllTagsVisible(false);
            setTagSearch("");
          }}
          aria-expanded={tagsOpen}
          aria-controls={tagPanelId}
          className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink-muted)]"
          title="标签筛选"
        >
          <Filter className="h-4 w-4" />
          标签{selectedTagIds.length > 0 ? ` · ${selectedTagIds.length}` : ""}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", tagsOpen && "rotate-180")} />
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
            {(mediaType === "video" || mediaType === "novel") && (
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

      {tagsOpen && (
        <div id={tagPanelId} role="region" aria-label="标签筛选" className="space-y-3 border-t border-[var(--line)] pt-3" onKeyDown={(event) => { if (event.key === "Escape") setTagsOpen(false); }}>
          <div className="flex flex-wrap items-center gap-2">
            <input type="search" aria-label="搜索筛选标签" placeholder="搜索标签…" value={tagSearch} onChange={(event) => setTagSearch(event.target.value)} className="min-w-0 rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent)]" />
            <select aria-label="标签匹配模式" value={tagMatch} onChange={(event) => setTagMatch(event.target.value as "all" | "any")} className="rounded-md border border-[var(--line)] bg-white px-2 py-1.5 text-xs text-[var(--ink-muted)]">
              <option value="any">任一匹配</option><option value="all">全部匹配</option>
            </select>
            {(hasMoreTags || allTagsVisible) && <button type="button" onClick={() => setAllTagsVisible((visible) => !visible)} className="text-xs text-[var(--accent)]">{allTagsVisible ? "收起标签" : "查看全部标签"}</button>}
            {selectedTagIds.length > 0 && <button type="button" onClick={() => setSelectedTagIds([])} className="text-xs text-[var(--ink-muted)] underline">清除筛选</button>}
          </div>
          <CategorizedTags tags={visibleTags} selectedIds={selectedTagIds} onToggle={toggleTagId} expanded={allTagsVisible} onExpand={() => setAllTagsVisible(true)} />
          {visibleTags.length === 0 && <p className="text-xs text-[var(--ink-faint)]">{tags.length ? "没有匹配的标签" : "暂无标签"}</p>}
        </div>
      )}
    </div>
  );
}
