"use client";

import { useState } from "react";
import { FolderPlus, X, Star } from "lucide-react";
import { useLibrary } from "@/lib/store";
import { cn } from "@/lib/utils";

export function OrganizePanel() {
  const { series, selectedIds, clearSelection, refresh, setPreviewSeriesId } = useLibrary();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = series.filter((s) => selectedIds.has(s.id));
  if (selected.length === 0) return null;

  const merge = async () => {
    if (selected.length < 2) {
      setErr("请至少选择两个系列");
      return;
    }
    if (!title.trim()) {
      setErr("请填写新系列名称");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mergeSeries",
          sourceIds: selected.map((s) => s.id),
          title: title.trim(),
        }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "合并失败");
        return;
      }
      clearSelection();
      setPreviewSeriesId(data.series?.id || null);
      setTitle("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "合并失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="glass flex w-[18rem] shrink-0 flex-col border-l border-[var(--line)]">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[var(--accent)]">整理系列</p>
          <p className="text-xs text-[var(--ink-muted)]">已选 {selected.length} 个</p>
        </div>
        <button
          type="button"
          onClick={clearSelection}
          className="rounded-lg p-1.5 text-[var(--ink-faint)] hover:bg-white/50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="px-4 pt-3 text-xs leading-relaxed text-[var(--ink-muted)]">
        将所选作品合并为一个系列，条目会按顺序归入新系列。
      </p>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 scrollbar-thin">
        {selected.map((s, i) => (
          <div
            key={s.id}
            className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white/40 p-2"
          >
            <div className="relative h-10 w-8 shrink-0 overflow-hidden rounded-md bg-[var(--accent-soft)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/thumbnails/${s.id}`}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">
                {i + 1}. {s.title}
              </p>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star
                    key={j}
                    className={cn(
                      "h-2 w-2",
                      j < s.rating
                        ? "fill-[var(--accent-hot)] text-[var(--accent-hot)]"
                        : "text-slate-300"
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-[var(--line)] p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="新系列名称"
          className="w-full rounded-xl border border-[var(--line)] bg-white/50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        {err && <p className="text-xs text-red-500">{err}</p>}
        <button
          type="button"
          disabled={busy || selected.length < 2}
          onClick={merge}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          <FolderPlus className="h-4 w-4" />
          创建系列
        </button>
      </div>
    </aside>
  );
}
