"use client";

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Clapperboard,
  Image as ImageIcon,
  Music2,
  ScrollText,
  Settings,
  Sparkles,
  PanelsTopLeft,
} from "lucide-react";
import { MEDIA_TYPE_LABELS, type MediaType } from "@/lib/types";
import { LIBRARY_TAB_ID, useLibrary } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ProfileSwitcher } from "@/components/ProfileSwitcher";

const TYPE_ICONS: Record<MediaType, React.ComponentType<{ className?: string }>> = {
  manga: BookOpen,
  webtoon: PanelsTopLeft,
  novel: ScrollText,
  video: Clapperboard,
  music: Music2,
  photo: ImageIcon,
};

const TYPES: MediaType[] = ["manga", "webtoon", "novel", "video", "music", "photo"];

export function TitleBar() {
  const { mediaType, setMediaType, stats, setShowSettings, total, activateTab, clearSelection } =
    useLibrary();
  const [showProfiles, setShowProfiles] = useState(false);
  const clickRef = useRef({ count: 0, timer: 0 as ReturnType<typeof setTimeout> | 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘⇧. / Ctrl+Shift+. 打开工作区切换（隐蔽入口）
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === ".") {
        e.preventDefault();
        setShowProfiles(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const secretClick = () => {
    const c = clickRef.current;
    c.count += 1;
    if (c.timer) clearTimeout(c.timer);
    c.timer = setTimeout(() => {
      c.count = 0;
    }, 1200);
    if (c.count >= 5) {
      c.count = 0;
      setShowProfiles(true);
    }
  };

  return (
    <>
      <header className="border-b border-[var(--line)] bg-[#f7f9f8]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={secretClick}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-white shadow-lg shadow-teal-900/10"
              title="Resources Manager"
            >
              <Sparkles className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-display truncate text-lg font-semibold tracking-tight text-[var(--ink)]">
                Resources Manager
              </h1>
              <p className="text-xs text-[var(--ink-muted)]">
                本地资源库 · {total} 部{MEDIA_TYPE_LABELS[mediaType]}
              </p>
            </div>
          </div>

          <nav className="ml-2 flex flex-1 items-center gap-1 overflow-x-auto scrollbar-thin">
            {TYPES.map((t) => {
              const Icon = TYPE_ICONS[t];
              const active = mediaType === t;
              const count = stats[t] || 0;
              return (
                <button
                  key={t}
                onClick={() => {
                  setMediaType(t);
                  clearSelection();
                  activateTab(LIBRARY_TAB_ID);
                }}
                  className={cn(
                    "group flex items-center gap-2 rounded-full px-3.5 py-2 text-sm transition-all",
                    active
                      ? "bg-[var(--ink)] text-white shadow-md"
                      : "text-[var(--ink-muted)] hover:bg-white hover:text-[var(--ink)]"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">{MEDIA_TYPE_LABELS[t]}</span>
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

          <button
            onClick={() => setShowSettings(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
            title="设置"
          >
            <Settings className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>
      <ProfileSwitcher open={showProfiles} onClose={() => setShowProfiles(false)} />
    </>
  );
}
