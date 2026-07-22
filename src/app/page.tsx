"use client";

import { useEffect, useRef, useState } from "react";
import { TitleBar } from "@/components/TitleBar";
import { TabBar } from "@/components/TabBar";
import { Toolbar } from "@/components/Toolbar";
import { SeriesGrid } from "@/components/SeriesGrid";
import { SeriesDetailView } from "@/components/SeriesDetailView";
import { BatchViewer } from "@/components/BatchViewer";
import { LIBRARY_TAB_ID, useLibrary } from "@/lib/store";
import { cn } from "@/lib/utils";

/** 短时虚化遮罩：仅过渡期挂载，结束后卸载，不常驻不影响滚动性能 */
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
      className="pointer-events-none absolute inset-0 z-20 animate-soft-veil bg-[#f7f9f8]/55"
    />
  );
}

export default function Home() {
  const { tabs, activeTabId, activateTab, closeTab } = useLibrary();
  const seriesTabs = tabs.filter((t) => t.kind === "series");
  const onLibrary = activeTabId === LIBRARY_TAB_ID;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="shrink-0 z-40">
        <TabBar />
        {onLibrary && <TitleBar />}
      </div>

      <div className="relative min-h-0 flex-1">
        <SoftVeil triggerKey={activeTabId} />

        <div
          className={cn(
            "absolute inset-0 overflow-y-auto scrollbar-thin transition-opacity duration-150",
            onLibrary ? "z-10 opacity-100" : "invisible pointer-events-none z-0 opacity-0"
          )}
        >
          <Toolbar />
          <SeriesGrid />
        </div>

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

      <BatchViewer />
    </div>
  );
}
