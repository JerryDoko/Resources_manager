"use client";

import { Search, Filter, Star, ArrowUpDown } from "lucide-react";
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
  } = useLibrary();

  const toggleTag = (id: string) => {
    if (selectedTagIds.includes(id)) {
      setSelectedTagIds(selectedTagIds.filter((t) => t !== id));
    } else {
      setSelectedTagIds([...selectedTagIds, id]);
    }
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-faint)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题或作者…"
            className="w-full rounded-xl border border-[var(--line)] bg-white py-2.5 pl-10 pr-4 text-sm outline-none ring-[var(--accent)] transition focus:ring-2"
          />
        </div>

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
          <div className="flex items-center gap-2 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent)]">
            已选 {selectedIds.size}
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
                onClick={() => toggleTag(tag.id)}
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
