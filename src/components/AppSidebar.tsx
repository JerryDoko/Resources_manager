"use client";

import {
  BookOpen,
  Clapperboard,
  Image as ImageIcon,
  Music2,
  ScrollText,
  Settings,
  PanelsTopLeft,
} from "lucide-react";
import { MEDIA_TYPE_LABELS, type MediaType } from "@/lib/types";
import { LIBRARY_TAB_ID, useLibrary } from "@/lib/store";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<MediaType, React.ComponentType<{ className?: string }>> = {
  manga: BookOpen,
  webtoon: PanelsTopLeft,
  novel: ScrollText,
  video: Clapperboard,
  music: Music2,
  photo: ImageIcon,
};

const TYPES: MediaType[] = ["manga", "webtoon", "novel", "video", "music", "photo"];

interface AppSidebarProps {
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

export function AppSidebar({ width, onResizeStart }: AppSidebarProps) {
  const {
    mediaType,
    setMediaType,
    stats,
    setShowSettings,
    clearSelection,
    activateTab,
  } = useLibrary();

  const switchType = (t: MediaType) => {
    setMediaType(t);
    clearSelection();
    activateTab(LIBRARY_TAB_ID);
  };

  return (
    <aside
      className="glass-sidebar relative flex shrink-0 flex-col border-r border-[var(--line)]"
      style={{ width }}
    >
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3 scrollbar-thin">
        {TYPES.map((t) => {
          const Icon = TYPE_ICONS[t];
          const active = mediaType === t;
          const count = stats[t] || 0;
          return (
            <button
              key={t}
              type="button"
              onClick={() => switchType(t)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active
                  ? "bg-[var(--accent)] text-white shadow-md shadow-violet-500/20"
                  : "text-[var(--ink-muted)] hover:bg-white/50 hover:text-[var(--ink)]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{MEDIA_TYPE_LABELS[t]}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] tabular-nums",
                  active ? "bg-white/20" : "bg-[var(--accent-soft)] text-[var(--accent)]"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-[var(--line)] p-3">
        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-[var(--ink-muted)] hover:bg-white/50 hover:text-[var(--ink)]"
        >
          <Settings className="h-4 w-4" />
          设置
        </button>
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧边栏宽度"
        onMouseDown={onResizeStart}
        className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize hover:bg-[var(--accent)]/20"
      />
    </aside>
  );
}
