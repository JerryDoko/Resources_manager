"use client";

import { Plus, X, LayoutGrid } from "lucide-react";
import { LIBRARY_TAB_ID, useLibrary, type WorkspaceTab } from "@/lib/store";
import { cn } from "@/lib/utils";

function TabIcon({ tab }: { tab: WorkspaceTab }) {
  if (tab.kind === "library") {
    return <LayoutGrid className="h-3.5 w-3.5 shrink-0 opacity-70" />;
  }
  return null;
}

export function TabBar() {
  const { tabs, activeTabId, activateTab, closeTab } = useLibrary();

  return (
    <div className="border-b border-[var(--line)] bg-[#d8e0de]">
      <div className="flex items-stretch gap-px overflow-x-auto px-2 pt-1.5 scrollbar-thin">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
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
                "group relative flex max-w-[200px] min-w-[110px] cursor-pointer items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs transition",
                active
                  ? "bg-[#f7f9f8] text-[var(--ink)]"
                  : "bg-[#c9d4d1]/80 text-[var(--ink-muted)] hover:bg-[#d5dedc]"
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
          );
        })}
        <button
          type="button"
          title="回到资源库"
          onClick={() => activateTab(LIBRARY_TAB_ID)}
          className="mb-0.5 ml-0.5 flex h-7 w-7 shrink-0 self-center items-center justify-center rounded-md text-[var(--ink-faint)] transition hover:bg-white/60 hover:text-[var(--ink)]"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
