"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MediaType, SortBy, TagMatchMode } from "@/lib/types";

export const LIBRARY_TAB_ID = "library";

export interface SeriesCard {
  id: string;
  title: string;
  author: string | null;
  mediaType: string;
  rating: number;
  thumbnailPath: string | null;
  itemCount: number;
  progress: number;
  captureDate: string | null;
  updatedAt: number;
  tags: { id: string; name: string; color: string }[];
}

export type WorkspaceTab =
  | { id: typeof LIBRARY_TAB_ID; kind: "library"; title: string }
  | {
      id: string;
      kind: "series";
      seriesId: string;
      title: string;
      mediaType: string;
    };

export interface BatchPlaylistItem {
  id: string;
  title: string;
  seriesTitle: string;
  progress: number;
  path?: string;
}

export interface BatchSession {
  mediaType: "photo" | "video";
  items: BatchPlaylistItem[];
  currentId: string;
}

interface LibraryContextValue {
  mediaType: MediaType;
  setMediaType: (t: MediaType) => void;
  search: string;
  setSearch: (s: string) => void;
  sortBy: SortBy;
  setSortBy: (s: SortBy) => void;
  selectedTagIds: string[];
  setSelectedTagIds: (ids: string[]) => void;
  tagMatch: TagMatchMode;
  setTagMatch: (m: TagMatchMode) => void;
  series: SeriesCard[];
  total: number;
  stats: Record<string, number>;
  tags: { id: string; name: string; color: string }[];
  loading: boolean;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  setSelectedIds: (ids: Set<string>) => void;
  clearSelection: () => void;
  refresh: () => Promise<void>;
  refreshTags: () => Promise<void>;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  musicQueue: { id: string; title: string; artist?: string } | null;
  setMusicQueue: (t: { id: string; title: string; artist?: string } | null) => void;
  tabs: WorkspaceTab[];
  activeTabId: string;
  activateTab: (id: string) => void;
  closeTab: (id: string) => void;
  openSeriesTab: (series: {
    seriesId: string;
    title: string;
    mediaType: string;
  }) => void;
  updateTabMeta: (
    tabId: string,
    patch: Partial<Pick<Extract<WorkspaceTab, { kind: "series" }>, "title" | "mediaType">>
  ) => void;
  batchSession: BatchSession | null;
  openBatchSession: (session: BatchSession) => void;
  setBatchCurrentId: (id: string) => void;
  closeBatchSession: () => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

const MAX_SERIES_TABS = 16;

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [mediaType, setMediaType] = useState<MediaType>("manga");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("updated");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagMatch, setTagMatch] = useState<TagMatchMode>("any");
  const [series, setSeries] = useState<SeriesCard[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const [musicQueue, setMusicQueue] = useState<{
    id: string;
    title: string;
    artist?: string;
  } | null>(null);
  const [tabs, setTabs] = useState<WorkspaceTab[]>([
    { id: LIBRARY_TAB_ID, kind: "library", title: "资源库" },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(LIBRARY_TAB_ID);
  const [batchSession, setBatchSession] = useState<BatchSession | null>(null);

  const refreshTags = useCallback(async () => {
    const res = await fetch("/api/tags", { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    setTags(data.tags || []);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: mediaType,
        sort: sortBy,
        tagMatch,
      });
      if (search) params.set("q", search);
      if (selectedTagIds.length) params.set("tags", selectedTagIds.join(","));

      const res = await fetch(`/api/library?${params}`, {
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      setSeries(data.items || []);
      setTotal(data.total || 0);
      setStats(data.stats?.seriesByType || {});
    } finally {
      setLoading(false);
    }
  }, [mediaType, search, sortBy, selectedTagIds, tagMatch]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    refreshTags();
  }, [refreshTags]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const openBatchSession = useCallback((session: BatchSession) => {
    setBatchSession(session);
  }, []);

  const setBatchCurrentId = useCallback((id: string) => {
    setBatchSession((s) => (s ? { ...s, currentId: id } : s));
  }, []);

  const closeBatchSession = useCallback(() => setBatchSession(null), []);

  const activateTab = useCallback((id: string) => {
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback((id: string) => {
    if (id === LIBRARY_TAB_ID) return;
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx < 0) return prev;
      const next = prev.filter((t) => t.id !== id);
      setActiveTabId((current) => {
        if (current !== id) return current;
        const fallback = next[Math.max(0, idx - 1)] || next[0];
        return fallback?.id || LIBRARY_TAB_ID;
      });
      return next;
    });
  }, []);

  const openSeriesTab = useCallback(
    (input: { seriesId: string; title: string; mediaType: string }) => {
      const tabId = `series:${input.seriesId}`;
      setTabs((prev) => {
        const existing = prev.find(
          (t) => t.kind === "series" && t.seriesId === input.seriesId
        );
        if (existing) {
          setActiveTabId(existing.id);
          return prev.map((t) =>
            t.id === existing.id
              ? {
                  ...t,
                  title: input.title || t.title,
                  mediaType: input.mediaType || (t.kind === "series" ? t.mediaType : input.mediaType),
                }
              : t
          );
        }

        let next = [...prev];
        const seriesCount = next.filter((t) => t.kind === "series").length;
        if (seriesCount >= MAX_SERIES_TABS) {
          const oldest = next.find((t) => t.kind === "series");
          if (oldest) next = next.filter((t) => t.id !== oldest.id);
        }

        next.push({
          id: tabId,
          kind: "series",
          seriesId: input.seriesId,
          title: input.title || "未命名",
          mediaType: input.mediaType,
        });
        setActiveTabId(tabId);
        return next;
      });
    },
    []
  );

  const updateTabMeta = useCallback(
    (
      tabId: string,
      patch: Partial<Pick<Extract<WorkspaceTab, { kind: "series" }>, "title" | "mediaType">>
    ) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId && t.kind === "series" ? { ...t, ...patch } : t))
      );
    },
    []
  );

  const value = useMemo(
    () => ({
      mediaType,
      setMediaType,
      search,
      setSearch,
      sortBy,
      setSortBy,
      selectedTagIds,
      setSelectedTagIds,
      tagMatch,
      setTagMatch,
      series,
      total,
      stats,
      tags,
      loading,
      selectedIds,
      toggleSelect,
      setSelectedIds,
      clearSelection,
      refresh,
      refreshTags,
      showSettings,
      setShowSettings,
      musicQueue,
      setMusicQueue,
      tabs,
      activeTabId,
      activateTab,
      closeTab,
      openSeriesTab,
      updateTabMeta,
      batchSession,
      openBatchSession,
      setBatchCurrentId,
      closeBatchSession,
    }),
    [
      mediaType,
      search,
      sortBy,
      selectedTagIds,
      tagMatch,
      series,
      total,
      stats,
      tags,
      loading,
      selectedIds,
      toggleSelect,
      clearSelection,
      refresh,
      refreshTags,
      showSettings,
      musicQueue,
      tabs,
      activeTabId,
      activateTab,
      closeTab,
      openSeriesTab,
      updateTabMeta,
      batchSession,
      openBatchSession,
      setBatchCurrentId,
      closeBatchSession,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}
