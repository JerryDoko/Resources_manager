"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { TabBar } from "@/components/TabBar";
import { Toolbar } from "@/components/Toolbar";
import { SeriesGrid } from "@/components/SeriesGrid";
import { SeriesDetailView } from "@/components/SeriesDetailView";
import { BatchViewer } from "@/components/BatchViewer";
import { ImportView } from "@/components/ImportView";
import { OrganizePanel } from "@/components/OrganizePanel";
import { LIBRARY_TAB_ID, useLibrary } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useAppChrome } from "@/lib/useAppChrome";
import { useMediaViewerOpen } from "@/lib/useMediaViewerOpen";

function SoftVeil({ triggerKey }: { triggerKey: string }) {
  const [show, setShow] = useState(false);
  const prev = useRef(triggerKey);

  useEffect(() => {
    if (prev.current === triggerKey) return;
    prev.current = triggerKey;
    setShow(true);
    const t = window.setTimeout(() => setShow(false), 200);
    return () => window.clearTimeout(t);
  }, [triggerKey]);

  if (!show) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 animate-soft-veil bg-white/30"
    />
  );
}

const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 360;
const SIDEBAR_DEFAULT = 248;

export function AppShell() {
  const {
    tabs,
    activeTabId,
    activateTab,
    closeTab,
    libraryViewMode,
    setLibraryViewMode,
    selectedIds,
    total,
  } = useLibrary();

  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const resizing = useRef(false);
  const { fullscreen } = useAppChrome();
  const viewerOpen = useMediaViewerOpen();
  const showTabBar = !fullscreen || !viewerOpen;

  useEffect(() => {
    const saved = localStorage.getItem("rm-sidebar-width");
    if (saved) {
      const n = Number(saved);
      if (n >= SIDEBAR_MIN && n <= SIDEBAR_MAX) setSidebarWidth(n);
    }
  }, []);

  const onSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startW = sidebarWidth;
    let liveW = startW;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      liveW = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + ev.clientX - startX));
      setSidebarWidth(liveW);
    };

    const onUp = () => {
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      localStorage.setItem("rm-sidebar-width", String(liveW));
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);

  const seriesTabs = tabs.filter((t) => t.kind === "series");
  const onLibrary = activeTabId === LIBRARY_TAB_ID;
  const showOrganize = libraryViewMode === "series" && selectedIds.size > 1;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {showTabBar && <TabBar />}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <AppSidebar width={sidebarWidth} onResizeStart={onSidebarResizeStart} />

        <div className="flex min-w-0 flex-1 flex-col">

        {onLibrary ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="glass flex shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-3">
              <div className="min-w-0">
                <h1 className="text-display text-lg font-semibold">
                  {libraryViewMode === "import" ? "导入视图" : "资源库"}
                </h1>
                <p className="text-xs text-[var(--ink-muted)]">
                  {libraryViewMode === "series" ? `共 ${total} 个系列` : "添加文件夹并扫描"}
                </p>
              </div>
              <div className="flex rounded-xl border border-[var(--line)] bg-white/40 p-0.5 text-sm">
                <button
                  type="button"
                  onClick={() => setLibraryViewMode("import")}
                  className={cn(
                    "rounded-lg px-4 py-1.5 transition",
                    libraryViewMode === "import"
                      ? "bg-[var(--accent)] text-white shadow"
                      : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  )}
                >
                  导入
                </button>
                <button
                  type="button"
                  onClick={() => setLibraryViewMode("series")}
                  className={cn(
                    "rounded-lg px-4 py-1.5 transition",
                    libraryViewMode === "series"
                      ? "bg-[var(--accent)] text-white shadow"
                      : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                  )}
                >
                  系列
                </button>
              </div>
            </header>

            <div className="relative flex min-h-0 flex-1">
              <main className="min-w-0 flex-1 overflow-y-auto scrollbar-thin">
                {libraryViewMode === "import" ? (
                  <ImportView />
                ) : (
                  <>
                    <Toolbar />
                    <SeriesGrid />
                  </>
                )}
              </main>
              {showOrganize && <OrganizePanel />}
            </div>
          </div>
        ) : (
          <div className="relative min-h-0 flex-1">
            <SoftVeil triggerKey={activeTabId} />
            {seriesTabs.map((tab) =>
              tab.kind === "series" ? (
                <div
                  key={tab.id}
                  className={cn(
                    "absolute inset-0 overflow-y-auto scrollbar-thin transition-opacity duration-150",
                    activeTabId === tab.id
                      ? "z-10 opacity-100"
                      : "invisible pointer-events-none z-0 opacity-0"
                  )}
                  aria-hidden={activeTabId !== tab.id}
                >
                  <SeriesDetailView
                    seriesId={tab.seriesId}
                    tabId={tab.id}
                    isActive={activeTabId === tab.id}
                    onBack={() => activateTab(LIBRARY_TAB_ID)}
                    onRemoved={() => closeTab(tab.id)}
                  />
                </div>
              ) : null
            )}
          </div>
        )}
        </div>
      </div>

      <BatchViewer />
    </div>
  );
}
