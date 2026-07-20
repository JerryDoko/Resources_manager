"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MediaType, SortBy, TagMatchMode } from "@/lib/types";

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
  clearSelection: () => void;
  refresh: () => Promise<void>;
  refreshTags: () => Promise<void>;
  activeSeriesId: string | null;
  setActiveSeriesId: (id: string | null) => void;
  showSettings: boolean;
  setShowSettings: (v: boolean) => void;
  musicQueue: { id: string; title: string; artist?: string } | null;
  setMusicQueue: (t: { id: string; title: string; artist?: string } | null) => void;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

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
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [musicQueue, setMusicQueue] = useState<{
    id: string;
    title: string;
    artist?: string;
  } | null>(null);

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
      clearSelection,
      refresh,
      refreshTags,
      activeSeriesId,
      setActiveSeriesId,
      showSettings,
      setShowSettings,
      musicQueue,
      setMusicQueue,
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
      activeSeriesId,
      showSettings,
      musicQueue,
    ]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within LibraryProvider");
  return ctx;
}
