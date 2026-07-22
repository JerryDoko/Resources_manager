"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Plus, X, LayoutGrid } from "lucide-react";
import { LIBRARY_TAB_ID, useLibrary, type WorkspaceTab } from "@/lib/store";
import { cn } from "@/lib/utils";
import { WindowControls } from "@/components/WindowControls";
import { useAppChrome } from "@/lib/useAppChrome";
import { ProfileSwitcher } from "@/components/ProfileSwitcher";

function TabIcon({ tab }: { tab: WorkspaceTab }) {
  if (tab.kind === "library") {
    return <LayoutGrid className="h-3.5 w-3.5 shrink-0 opacity-70" />;
  }
  return null;
}

export function TabBar() {
  const { tabs, activeTabId, activateTab, closeTab } = useLibrary();
  const { mac, titlebarPadClass } = useAppChrome();
  const [showProfiles, setShowProfiles] = useState(false);
  const clickRef = useRef({ count: 0, timer: 0 as ReturnType<typeof setTimeout> | 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      <div className="window-drag shrink-0 border-b border-[var(--line)] bg-white">
        <div
          className={cn(
            "flex h-[52px] items-center gap-3 px-3",
            titlebarPadClass,
            mac && "pl-[76px]"
          )}
        >
          {!mac && <WindowControls className="window-no-drag shrink-0" />}

          <button
            type="button"
            onClick={secretClick}
            title="Resources Manager"
            aria-label="Resources Manager"
            className="window-no-drag flex h-8 w-8 shrink-0 items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/app-icon.png"
              alt=""
              className="h-8 w-8 rounded-xl shadow-sm"
            />
          </button>

          <div className="h-7 w-px shrink-0 bg-[var(--line)]" aria-hidden />

          <div className="window-no-drag flex min-w-0 flex-1 items-center overflow-x-auto scrollbar-thin">
            <div className="flex items-center rounded-lg border border-[var(--line)] bg-[#f3f5f4] p-0.5">
              {tabs.map((tab, index) => {
              const active = tab.id === activeTabId;
              return (
                <Fragment key={tab.id}>
                  {index > 0 && (
                    <div className="h-4 w-px shrink-0 bg-[var(--line)]" aria-hidden />
                  )}
                <div
                  role="tab"
                  aria-selected={active}
                  onClick={() => activateTab(tab.id)}
                  onAuxClick={(e) => {
                    if (e.button === 1 && tab.kind === "series") {
                      e.preventDefault();
                      closeTab(tab.id);
                    }
                  }}
                  className={cn(
                    "group relative flex max-w-[180px] min-w-[96px] cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition",
                    active
                      ? "bg-white text-[var(--ink)] shadow-sm"
                      : "text-[var(--ink-muted)] hover:bg-white/60"
                  )}
                >
                  <TabIcon tab={tab} />
                  <span className="min-w-0 flex-1 truncate font-medium" title={tab.title}>
                    {tab.title}
                  </span>
                  {tab.kind === "series" ? (
                    <button
                      type="button"
                      aria-label={`关闭 ${tab.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition",
                        active
                          ? "text-[var(--ink-faint)] hover:bg-black/10 hover:text-[var(--ink)]"
                          : "opacity-0 group-hover:opacity-100 hover:bg-black/10"
                      )}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : (
                    <span className="h-4 w-4 shrink-0" />
                  )}
                </div>
                </Fragment>
              );
            })}
              <div className="h-4 w-px shrink-0 bg-[var(--line)]" aria-hidden />
              <button
                type="button"
                title="回到资源库"
                onClick={() => activateTab(LIBRARY_TAB_ID)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--ink-faint)] transition hover:bg-white/80 hover:text-[var(--ink)]"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <ProfileSwitcher open={showProfiles} onClose={() => setShowProfiles(false)} />
    </>
  );
}
