"use client";

import { TitleBar } from "@/components/TitleBar";
import { TabBar } from "@/components/TabBar";
import { Toolbar } from "@/components/Toolbar";
import { SeriesGrid } from "@/components/SeriesGrid";
import { CaptureCalendar } from "@/components/CaptureCalendar";
import { SeriesDetailView } from "@/components/SeriesDetailView";
import { LIBRARY_TAB_ID, useLibrary } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function Home() {
  const { tabs, activeTabId, activateTab, closeTab } = useLibrary();
  const seriesTabs = tabs.filter((t) => t.kind === "series");

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="shrink-0 z-40">
        <TabBar />
        <TitleBar />
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          className={cn(
            "absolute inset-0 overflow-y-auto scrollbar-thin",
            activeTabId === LIBRARY_TAB_ID
              ? "z-10 visible"
              : "invisible pointer-events-none z-0"
          )}
        >
          <Toolbar />
          <CaptureCalendar />
          <SeriesGrid />
        </div>

        {seriesTabs.map((tab) =>
          tab.kind === "series" ? (
            <div
              key={tab.id}
              className={cn(
                "absolute inset-0 overflow-y-auto scrollbar-thin",
                activeTabId === tab.id
                  ? "z-10 visible"
                  : "invisible pointer-events-none z-0"
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
    </div>
  );
}
