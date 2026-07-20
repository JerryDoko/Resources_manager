"use client";

import { useMemo } from "react";
import { useLibrary } from "@/lib/store";

/** Capture-date calendar strip for video / photo libraries */
export function CaptureCalendar() {
  const { mediaType, series, setSearch, setSortBy } = useLibrary();

  const days = useMemo(() => {
    if (mediaType !== "video" && mediaType !== "photo") return [];
    const map = new Map<string, number>();
    for (const s of series) {
      if (!s.captureDate) continue;
      map.set(s.captureDate, (map.get(s.captureDate) || 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 30);
  }, [mediaType, series]);

  if (days.length === 0) return null;

  return (
    <div className="mx-auto max-w-[1600px] px-5 pb-2">
      <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-[var(--line)] bg-white/70 px-3 py-2.5 scrollbar-thin">
        <span className="shrink-0 text-xs font-medium text-[var(--ink-muted)]">拍摄日历</span>
        {days.map(([day, count]) => (
          <button
            key={day}
            onClick={() => {
              setSortBy("capture");
              setSearch(day);
            }}
            className="shrink-0 rounded-xl bg-[var(--accent-soft)] px-3 py-1.5 text-xs text-[var(--accent)] transition hover:bg-[var(--accent)] hover:text-white"
          >
            {day}
            <span className="ml-1 opacity-70">×{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
