"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Star,
  BookOpen,
  Image as ImageIcon,
  Trash2,
  FolderOpen,
  Check,
  Filter,
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarPlus,
  CalendarClock,
  ChevronDown,
  Lock,
  LockOpen,
  LoaderCircle,
  Sparkles,
  FolderPlus,
  FolderInput,
  Search,
  X,
} from "lucide-react";
import { useLibrary } from "@/lib/store";
import {
  MEDIA_TYPE_LABELS,
  type ItemSortKey,
  type MediaType,
  type SortDirection,
} from "@/lib/types";
import { cn, formatBytes, formatDate, formatDuration } from "@/lib/utils";
import { MangaReader } from "@/components/viewers/MangaReader";
import { VideoPlayer } from "@/components/viewers/VideoPlayer";
import { NovelReader } from "@/components/viewers/NovelReader";
import { VideoItemThumbnail } from "@/components/VideoItemThumbnail";

function dirname(filePath: string) {
  const i = filePath.lastIndexOf("/");
  return i > 0 ? filePath.slice(0, i) : filePath;
}

function ItemRatingStars({
  rating,
  onRate,
}: {
  rating: number;
  onRate: (rating: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {Array.from({ length: 5 }).map((_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`${i + 1} 星`}
          onClick={(e) => {
            e.stopPropagation();
            onRate(i + 1 === rating ? 0 : i + 1);
          }}
        >
          <Star
            className={cn(
              "h-3.5 w-3.5 transition",
              i < rating
                ? "fill-[var(--accent-hot)] text-[var(--accent-hot)]"
                : "text-[#cfd8d6] hover:text-[var(--accent-hot)]"
            )}
          />
        </button>
      ))}
    </div>
  );
}

interface SeriesDetail {
  id: string;
  title: string;
  author: string | null;
  mediaType: string;
  rating: number;
  itemCount: number;
  manualGroup: boolean;
  progress: number;
  thumbnailPath: string | null;
  captureDate: string | null;
  createdAt: number;
  updatedAt: number;
  items: {
    id: string;
    title: string;
    path: string;
    sortOrder: number;
    duration: number | null;
    fileSize: number;
    progress: number;
    rating: number;
    metadata: string | null;
    captureDate: string | null;
    createdAt: number;
    updatedAt: number;
    fileCreatedAt: number;
    fileModifiedAt: number;
  }[];
  tags: { id: string; name: string; color: string }[];
}

interface SeriesDetailViewProps {
  seriesId: string;
  tabId: string;
  isActive: boolean;
  onBack: () => void;
  onRemoved: () => void;
}

type DragBox = { x0: number; y0: number; x1: number; y1: number };
const itemSortOptions: Array<{
  key: ItemSortKey;
  label: string;
  icon: typeof ArrowDownAZ;
}> = [
  { key: "name", label: "根据名称", icon: ArrowDownAZ },
  { key: "created", label: "添加日期", icon: CalendarPlus },
  { key: "updated", label: "修改日期", icon: CalendarClock },
];

const itemTitleCollator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

function compareNumber(a: number | null | undefined, b: number | null | undefined) {
  return (a || 0) - (b || 0);
}

function sortItems(
  items: SeriesDetail["items"],
  key: ItemSortKey,
  direction: SortDirection
) {
  const sign = direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let result = 0;
    if (key === "name") {
      result = itemTitleCollator.compare(a.title, b.title);
      if (result === 0) result = itemTitleCollator.compare(a.path, b.path);
    } else if (key === "created") {
      result = compareNumber(a.fileCreatedAt, b.fileCreatedAt);
    } else {
      result = compareNumber(a.fileModifiedAt, b.fileModifiedAt);
    }

    if (result === 0) {
      result = compareNumber(a.sortOrder, b.sortOrder) || itemTitleCollator.compare(a.title, b.title);
    }
    return result * sign;
  });
}

function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

export function SeriesDetailView({
  seriesId,
  tabId,
  isActive,
  onBack,
  onRemoved,
}: SeriesDetailViewProps) {
  const {
    tags,
    refresh,
    refreshTags,
    updateTabMeta,
  } = useLibrary();
  const [data, setData] = useState<SeriesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerItemId, setViewerItemId] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [itemRatingFilter, setItemRatingFilter] = useState(0);
  const [itemSearch, setItemSearch] = useState("");
  const [itemSearchField, setItemSearchField] = useState<"all" | "name" | "path" | "date">("all");
  const [itemSortKey, setItemSortKey] = useState<ItemSortKey>("name");
  const [itemSortDirection, setItemSortDirection] = useState<SortDirection>("asc");
  const [itemSortLocked, setItemSortLocked] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [autoImportMessage, setAutoImportMessage] = useState<string | null>(null);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [itemThumbFailed, setItemThumbFailed] = useState(false);
  const [drag, setDrag] = useState<DragBox | null>(null);
  const [aiTagging, setAiTagging] = useState(false);
  const [aiTagMessage, setAiTagMessage] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<"create" | "move" | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupTargets, setGroupTargets] = useState<Array<{ id: string; title: string; itemCount: number }>>([]);
  const [groupTargetId, setGroupTargetId] = useState("");
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const groupMediaType = data?.mediaType;

  const listContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const dragStart = useRef<{ x: number; y: number; additive: boolean } | null>(null);
  const didDrag = useRef(false);
  const lastClickedId = useRef<string | null>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const restoreViewedItemId = useRef<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/library/${seriesId}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        setData(null);
        return;
      }
      const json = (await res.json()) as SeriesDetail;
      setData(json);
      setThumbFailed(false);
      updateTabMeta(tabId, {
        title: json.title,
        mediaType: json.mediaType,
      });
      if (["manga", "webtoon", "photo"].includes(json.mediaType)) {
        const syncRes = await fetch(`/api/library/${seriesId}`, {
          method: "POST",
          signal: AbortSignal.timeout(30000),
        });
        const sync = await syncRes.json();
        if (syncRes.ok && sync.added > 0) {
          setAutoImportMessage(`已自动导入 ${sync.added} 张新图片`);
          const refreshed = await fetch(`/api/library/${seriesId}`, {
            signal: AbortSignal.timeout(10000),
          });
          if (refreshed.ok) setData((await refreshed.json()) as SeriesDetail);
          refresh();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isActive) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, seriesId]);

  // 切走标签时关闭播放器，避免与其它页叠层
  useEffect(() => {
    if (!isActive) setViewerItemId(null);
  }, [isActive]);

  useEffect(() => {
    setSelectedItemIds(new Set());
    setItemRatingFilter(0);
    setItemSortKey("name");
    setItemSortDirection("asc");
    setItemSortLocked(false);
    setAutoImportMessage(null);
    setSortMenuOpen(false);
    setFocusedItemId(null);
    fetch("/api/settings", { signal: AbortSignal.timeout(10000) })
      .then((response) => response.json())
      .then((settings) => {
        const preference = settings.itemSortPreferences?.[seriesId];
        if (!preference) return;
        setItemSortKey(preference.key);
        setItemSortDirection(preference.direction);
        setItemSortLocked(true);
      })
      .catch(() => {});
  }, [seriesId]);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!sortMenuRef.current?.contains(event.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSortMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [sortMenuOpen]);

  const setRating = async (rating: number) => {
    await fetch(`/api/library/${seriesId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
      signal: AbortSignal.timeout(10000),
    });
    setData((d) => (d ? { ...d, rating } : d));
    refresh();
  };

  const toggleTag = async (tagId: string) => {
    if (!data) return;
    const has = data.tags.some((t) => t.id === tagId);
    const next = has
      ? data.tags.filter((t) => t.id !== tagId).map((t) => t.id)
      : [...data.tags.map((t) => t.id), tagId];
    const res = await fetch(`/api/library/${seriesId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tagIds: next }),
      signal: AbortSignal.timeout(10000),
    });
    setData(await res.json());
    refresh();
  };

  const createAndApplyTag = async () => {
    const name = prompt("新标签名称");
    if (!name) return;
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name }),
      signal: AbortSignal.timeout(10000),
    });
    const { tag } = await res.json();
    await refreshTags();
    if (tag) await toggleTag(tag.id);
  };

  const analyzeImageTags = async () => {
    if (!data) return;
    const target = focusedItemId
      ? data.items.find((item) => item.id === focusedItemId)
      : data.items[0];
    if (!target) return;
    setAiTagging(true);
    setAiTagMessage("正在识别图片…");
    try {
      const settingsResponse = await fetch("/api/settings", {
        signal: AbortSignal.timeout(10000),
      });
      const settings = await settingsResponse.json();
      if (!settings.aiEnabled) throw new Error("请先在设置中启用 AI 控制");
      if (settings.aiPermissionLevel === "read") {
        throw new Error("图片打标签需要“可恢复级”或“危险级”权限");
      }
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.aiControlToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "image.analyzeAndTag",
          params: { itemId: target.id, maxTags: 6 },
        }),
        signal: AbortSignal.timeout(100000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "图片识别失败");
      const names = (result.result?.tags || [])
        .map((tag: { name?: string }) => tag.name)
        .filter(Boolean);
      setAiTagMessage(`已添加标签：${names.join("、")}`);
      await refreshTags();
      await load();
      refresh();
    } catch (error) {
      setAiTagMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setAiTagging(false);
    }
  };

  const removeSeries = async () => {
    if (!confirm("从库中移除此系列？（不会删除磁盘文件）")) return;
    await fetch(`/api/library/${seriesId}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(10000),
    });
    refresh();
    onRemoved();
  };

  const openItem = (item: SeriesDetail["items"][0]) => {
    if (!data) return;
    setViewerItemId(item.id);
  };

  const closeViewer = useCallback(() => {
    const viewedId = viewerItemId;
    if (viewedId) {
      restoreViewedItemId.current = viewedId;
      setFocusedItemId(viewedId);
      lastClickedId.current = viewedId;
    }
    setViewerItemId(null);
    refresh();
  }, [refresh, viewerItemId]);

  const updateImageProgress = useCallback((itemId: string, progress: number) => {
    setData((current) => {
      if (!current) return current;
      const item = current.items.find((entry) => entry.id === itemId);
      if (current.progress === progress && item?.progress === progress) {
        return current;
      }
      return {
        ...current,
        progress,
        items: current.items.map((entry) =>
          entry.id === itemId ? { ...entry, progress } : entry
        ),
      };
    });
  }, []);

  const revealItemPath = useCallback(async (itemPath: string) => {
    if (window.rmDesktop?.revealItem) {
      await window.rmDesktop.revealItem(itemPath);
      return;
    }
    await fetch("/api/system/reveal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: itemPath }),
      signal: AbortSignal.timeout(10000),
    });
  }, []);

  const setItemRating = async (itemId: string, rating: number) => {
    await fetch("/api/items", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rating", id: itemId, rating }),
      signal: AbortSignal.timeout(10000),
    });
    setData((d) =>
      d
        ? {
            ...d,
            items: d.items.map((i) => (i.id === itemId ? { ...i, rating } : i)),
          }
        : d
    );
  };

  const setItemSort = (key: ItemSortKey) => {
    const direction =
      itemSortKey === key
        ? itemSortDirection === "asc"
          ? "desc"
          : "asc"
        : "asc";
    setItemSortKey(key);
    setItemSortDirection(direction);
    if (itemSortLocked) saveItemSortPreference(true, key, direction);
    setSortMenuOpen(false);
  };

  const saveItemSortPreference = (
    locked: boolean,
    key = itemSortKey,
    direction = itemSortDirection
  ) => {
    fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemSortPreference: { seriesId, locked, key, direction },
      }),
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  };

  const toggleItemSortLock = () => {
    const locked = !itemSortLocked;
    setItemSortLocked(locked);
    saveItemSortPreference(locked);
  };

  const toggleItemSelect = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  useEffect(() => {
    if (groupMode !== "move" || !groupMediaType) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ type: groupMediaType, limit: "200", q: groupSearch });
        const response = await fetch(`/api/library?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error("无法读取分组列表");
        const result = await response.json();
        setGroupTargets((result.items || []).filter((item: { id: string }) => item.id !== seriesId));
      } catch (error) {
        if (!controller.signal.aborted) setGroupError(error instanceof Error ? error.message : "读取失败");
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [groupMode, groupSearch, groupMediaType, seriesId]);

  const submitGroup = async () => {
    if (!groupMode || groupBusy) return;
    const title = groupName.trim();
    if (groupMode === "create" && !title) {
      setGroupError("请输入新分组名称");
      return;
    }
    if (groupMode === "move" && !groupTargetId) {
      setGroupError("请选择目标分组");
      return;
    }
    setGroupBusy(true);
    setGroupError(null);
    try {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "regroup",
          sourceSeriesId: seriesId,
          itemIds: [...selectedItemIds],
          ...(groupMode === "create" ? { title } : { targetSeriesId: groupTargetId }),
        }),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "分组失败");
      setGroupMode(null);
      setSelectedItemIds(new Set());
      setFocusedItemId(null);
      await refresh();
      if (result.sourceRemoved) onRemoved();
      else await load();
    } catch (error) {
      setGroupError(error instanceof Error ? error.message : "分组失败");
    } finally {
      setGroupBusy(false);
    }
  };

  const selectRange = (fromId: string, toId: string, ids: string[]) => {
    const a = ids.indexOf(fromId);
    const b = ids.indexOf(toId);
    if (a < 0 || b < 0) return;
    const [start, end] = a < b ? [a, b] : [b, a];
    setSelectedItemIds(new Set(ids.slice(start, end + 1)));
  };

  const onListMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("[data-item-row]")) return;
      didDrag.current = false;
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        additive: e.metaKey || e.ctrlKey || e.shiftKey,
      };
      setDrag({ x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY });

      const onMove = (ev: MouseEvent) => {
        if (!dragStart.current) return;
        const dx = Math.abs(ev.clientX - dragStart.current.x);
        const dy = Math.abs(ev.clientY - dragStart.current.y);
        if (dx > 4 || dy > 4) didDrag.current = true;
        setDrag({
          x0: dragStart.current.x,
          y0: dragStart.current.y,
          x1: ev.clientX,
          y1: ev.clientY,
        });
      };

      const onUp = (ev: MouseEvent) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const start = dragStart.current;
        dragStart.current = null;
        setDrag(null);
        if (!start) return;

        if (!didDrag.current) {
          if (!start.additive) {
            setSelectedItemIds(new Set());
            setFocusedItemId(null);
          }
          return;
        }

        const box = {
          left: Math.min(start.x, ev.clientX),
          top: Math.min(start.y, ev.clientY),
          right: Math.max(start.x, ev.clientX),
          bottom: Math.max(start.y, ev.clientY),
        };

        const hit = new Set<string>();
        for (const [id, el] of itemRefs.current) {
          const r = el.getBoundingClientRect();
          if (rectsIntersect(box, { left: r.left, top: r.top, right: r.right, bottom: r.bottom })) {
            hit.add(id);
          }
        }

        if (start.additive) {
          setSelectedItemIds((prev) => new Set([...prev, ...hit]));
        } else {
          setSelectedItemIds(hit);
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    []
  );

  const handleItemClick = (
    item: SeriesDetail["items"][0],
    e: React.MouseEvent,
    orderedIds: string[]
  ) => {
    if (didDrag.current) return;

    if (e.shiftKey && lastClickedId.current) {
      e.preventDefault();
      selectRange(lastClickedId.current, item.id, orderedIds);
      setFocusedItemId(item.id);
      return;
    }

    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      toggleItemSelect(item.id);
      lastClickedId.current = item.id;
      setFocusedItemId(item.id);
      return;
    }

    if (focusedItemId === item.id) {
      openItem(item);
      return;
    }

    setFocusedItemId(item.id);
    setSelectedItemIds(new Set());
    lastClickedId.current = item.id;
    setItemThumbFailed(false);
  };

  const folderPath = data?.items[0]?.path ? dirname(data.items[0].path) : null;
  const focusedItem = focusedItemId
    ? data?.items.find((i) => i.id === focusedItemId) ?? null
    : null;
  const normalizedSearch = itemSearch.trim().normalize("NFKC").toLocaleLowerCase();
  const filteredItems =
    data?.items.filter((item) => {
      if (itemRatingFilter === -1 && item.rating !== 0) return false;
      if (itemRatingFilter > 0 && item.rating < itemRatingFilter) return false;
      if (!normalizedSearch) return true;

      const dates = [item.captureDate, formatDate(item.fileCreatedAt), formatDate(item.fileModifiedAt)]
        .filter(Boolean)
        .join(" ");
      const fields = {
        name: item.title,
        path: item.path,
        date: dates,
        all: [item.title, item.path, dates, item.metadata || "", formatBytes(item.fileSize)].join(" "),
      };
      return fields[itemSearchField].normalize("NFKC").toLocaleLowerCase().includes(normalizedSearch);
    }) ?? [];
  const sortedItems = sortItems(filteredItems, itemSortKey, itemSortDirection);

  const viewerItem = data?.items.find((i) => i.id === viewerItemId);
  const totalSize = data?.items.reduce((s, i) => s + (i.fileSize || 0), 0) ?? 0;
  const typeLabel =
    MEDIA_TYPE_LABELS[(data?.mediaType as MediaType) || "manga"] || data?.mediaType;
  const orderedFilteredIds = sortedItems.map((i) => i.id);
  const dragBoxStyle = drag
    ? {
        left: Math.min(drag.x0, drag.x1),
        top: Math.min(drag.y0, drag.y1),
        width: Math.abs(drag.x1 - drag.x0),
        height: Math.abs(drag.y1 - drag.y0),
      }
    : null;
  const isImageSequence = ["manga", "webtoon", "photo"].includes(
    data?.mediaType ?? ""
  );

  useEffect(() => {
    if (viewerItemId !== null || !restoreViewedItemId.current) return;
    const itemId = restoreViewedItemId.current;
    let frame = 0;
    let attempts = 0;
    const restore = () => {
      const row = itemRefs.current.get(itemId);
      if (row) {
        row.scrollIntoView({ block: "center", behavior: "auto" });
        restoreViewedItemId.current = null;
        return;
      }
      if (attempts++ < 6) frame = requestAnimationFrame(restore);
      else restoreViewedItemId.current = null;
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [viewerItemId, data, itemRatingFilter, itemSearch, itemSearchField, itemSortKey, itemSortDirection]);

  // 播放器独占：不与详情页 DOM 并存，避免叠层
  if (isActive && viewerItem && data) {
    if (
      data.mediaType === "manga" ||
      data.mediaType === "webtoon" ||
      data.mediaType === "photo"
    ) {
      return (
        <MangaReader
          itemId={viewerItem.id}
          title={viewerItem.title}
          mediaType={
            data.mediaType === "webtoon"
              ? "webtoon"
              : data.mediaType === "photo"
                ? "photo"
                : "manga"
          }
          itemPath={viewerItem.path}
          playlist={sortedItems.map((i) => ({
            id: i.id,
            title: i.title,
            path: i.path,
          }))}
          onChangeItem={setViewerItemId}
          onProgressChange={updateImageProgress}
          onClose={closeViewer}
        />
      );
    }
    if (data.mediaType === "video") {
      return (
        <VideoPlayer
          itemId={viewerItem.id}
          title={viewerItem.title}
          initialProgress={viewerItem.progress}
          playlist={sortedItems.map((i) => ({
            id: i.id,
            title: i.title,
            progress: i.progress,
          }))}
          playlistKey={seriesId}
          onChangeItem={setViewerItemId}
          onClose={() => setViewerItemId(null)}
          onThumbnailUpdated={() => {
            load();
            refresh();
          }}
        />
      );
    }
    if (data.mediaType === "novel") {
      return (
        <NovelReader
          itemId={viewerItem.id}
          title={viewerItem.title}
          onClose={() => setViewerItemId(null)}
        />
      );
    }
  }

  return (
    <div className="min-h-full">
      <header className="border-b border-[var(--line)] bg-[#f7f9f8]/80">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            <ArrowLeft className="h-4 w-4" />
            返回库
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {loading ? "加载中…" : data?.title || "未找到"}
            </p>
            <p className="text-xs text-[var(--ink-faint)]">{typeLabel}</p>
          </div>
          {data && (
            <button
              onClick={removeSeries}
              className="rounded-xl p-2 text-[var(--ink-faint)] hover:bg-red-50 hover:text-red-600"
              title="从库中移除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {!loading && !data && (
        <div className="mx-auto max-w-lg px-5 py-24 text-center">
          <h1 className="text-display text-2xl font-semibold">系列不存在</h1>
          <button
            onClick={onBack}
            className="mt-4 text-sm text-[var(--accent)] underline"
          >
            返回首页
          </button>
        </div>
      )}

      {groupMode && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !groupBusy) setGroupMode(null);
        }}>
          <div role="dialog" aria-modal="true" aria-label={groupMode === "create" ? "创建新分组" : "移动到已有分组"} className="w-full max-w-md rounded-lg border border-[var(--line)] bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">{groupMode === "create" ? "创建新分组" : "移动到已有分组"}</h3>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              已选 {selectedItemIds.size} 个文件。仅更改资源库分组，不移动磁盘文件。
            </p>
            {groupMode === "create" ? (
              <input
                autoFocus
                value={groupName}
                maxLength={120}
                onChange={(event) => setGroupName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void submitGroup(); }}
                placeholder="新分组名称"
                className="mt-4 w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            ) : (
              <>
                <input
                  autoFocus
                  value={groupSearch}
                  onChange={(event) => { setGroupSearch(event.target.value); setGroupTargetId(""); }}
                  placeholder="搜索同类型分组"
                  className="mt-4 w-full rounded-md border border-[var(--line)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-[var(--line)]">
                  {groupTargets.map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => setGroupTargetId(target.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2 text-left text-sm last:border-b-0",
                        groupTargetId === target.id ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "hover:bg-[var(--bg)]"
                      )}
                    >
                      <span className="min-w-0 truncate">{target.title}</span>
                      <span className="shrink-0 text-xs text-[var(--ink-faint)]">{target.itemCount} 个</span>
                    </button>
                  ))}
                  {groupTargets.length === 0 && <p className="px-3 py-4 text-center text-xs text-[var(--ink-faint)]">没有可选分组</p>}
                </div>
              </>
            )}
            {groupError && <p className="mt-3 text-xs text-red-600">{groupError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={groupBusy} onClick={() => setGroupMode(null)} className="rounded-md border border-[var(--line)] px-4 py-2 text-xs">取消</button>
              <button type="button" disabled={groupBusy} onClick={() => void submitGroup()} className="rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white disabled:opacity-50">
                {groupBusy ? "处理中…" : groupMode === "create" ? "创建并分组" : "移动"}
              </button>
            </div>
          </div>
        </div>
      )}

      {data && (
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[320px_1fr] lg:items-start">
          <aside className="animate-fade-up lg:sticky lg:top-4 lg:max-h-[calc(100dvh-5rem)] lg:self-start lg:overflow-y-auto lg:scrollbar-thin">
            <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-lg shadow-teal-900/5">
              <div className="relative aspect-[3/4] bg-[#152022]">
                {focusedItem ? (
                  !itemThumbFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/thumbnails/item/${focusedItem.id}?t=${focusedItem.updatedAt}`}
                      alt={focusedItem.title}
                      className="h-full w-full object-cover"
                      onError={() => setItemThumbFailed(true)}
                    />
                  ) : (
                    <div className="flex h-full items-end p-5">
                      <span className="text-display text-lg text-white/90 line-clamp-4">
                        {focusedItem.title}
                      </span>
                    </div>
                  )
                ) : !thumbFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/thumbnails/${data.id}?t=${data.updatedAt}`}
                    alt={data.title}
                    className="h-full w-full object-cover"
                    onError={() => setThumbFailed(true)}
                  />
                ) : (
                  <div className="flex h-full items-end p-5">
                    <span className="text-display text-2xl text-white/90">{data.title}</span>
                  </div>
                )}
              </div>
              <div className="space-y-3 p-4">
                {focusedItem ? (
                  <>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-faint)]">
                        单张详情
                      </p>
                      <h1 className="text-display mt-1 text-lg font-semibold leading-snug">
                        {focusedItem.title}
                      </h1>
                      <p className="mt-1 text-xs text-[var(--ink-faint)]">
                        {typeLabel} · {formatBytes(focusedItem.fileSize)}
                        {focusedItem.duration != null &&
                          ` · ${formatDuration(focusedItem.duration)}`}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-faint)]">
                        评分
                      </p>
                      <ItemRatingStars
                        rating={focusedItem.rating}
                        onRate={(r) => setItemRating(focusedItem.id, r)}
                      />
                    </div>
                    <div className="rounded-xl bg-[var(--bg)] px-3 py-2.5 text-xs text-[var(--ink-muted)]">
                      <p className="mb-2 flex items-center gap-1.5 font-medium text-[var(--ink)]">
                        <FolderOpen className="h-3.5 w-3.5" />
                        信息
                      </p>
                      <dl className="space-y-1.5">
                        <div>
                          <dt className="text-[var(--ink-faint)]">文件路径</dt>
                          <dd className="mt-0.5 break-all text-[10px] leading-relaxed">
                            {focusedItem.path}
                          </dd>
                        </div>
                        {focusedItem.captureDate && (
                          <div className="flex justify-between gap-2">
                            <dt className="text-[var(--ink-faint)]">拍摄日期</dt>
                            <dd>{formatDate(focusedItem.captureDate)}</dd>
                          </div>
                        )}
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--ink-faint)]">添加日期</dt>
                          <dd className="min-w-0 truncate text-right">
                            {formatDate(focusedItem.fileCreatedAt)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--ink-faint)]">修改日期</dt>
                          <dd className="min-w-0 truncate text-right">
                            {formatDate(focusedItem.fileModifiedAt)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openItem(focusedItem)}
                        className="min-w-0 flex-1 rounded-xl bg-[var(--accent)] px-3 py-2.5 text-sm font-medium text-white"
                      >
                        打开查看
                      </button>
                      <button
                        type="button"
                        onClick={() => revealItemPath(focusedItem.path)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-white text-[var(--ink-muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                        title="在访达/文件夹中显示"
                        aria-label="在访达或文件夹中显示此图片"
                      >
                        <FolderOpen className="h-4 w-4" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-faint)]">
                        文件夹
                      </p>
                      <h1 className="text-display mt-1 text-xl font-semibold leading-snug">
                        {data.title}
                      </h1>
                      <p className="mt-1 text-sm text-[var(--ink-muted)]">
                        {data.author || "未知作者"}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--ink-faint)]">
                        {typeLabel} · {formatBytes(totalSize)} · {data.itemCount} 项
                      </p>
                    </div>

                    <div>
                      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--ink-faint)]">
                        评分
                      </p>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <button key={i} onClick={() => setRating(i + 1)}>
                            <Star
                              className={cn(
                                "h-5 w-5 transition",
                                i < data.rating
                                  ? "fill-[var(--accent-hot)] text-[var(--accent-hot)]"
                                  : "text-[#cfd8d6] hover:text-[var(--accent-hot)]"
                              )}
                            />
                          </button>
                        ))}
                        {data.rating > 0 && (
                          <button
                            onClick={() => setRating(0)}
                            className="ml-2 text-xs text-[var(--ink-faint)] underline"
                          >
                            清除
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl bg-[var(--bg)] px-3 py-2.5 text-xs text-[var(--ink-muted)]">
                      <p className="mb-2 flex items-center gap-1.5 font-medium text-[var(--ink)]">
                        <FolderOpen className="h-3.5 w-3.5" />
                        信息
                      </p>
                      <dl className="space-y-1.5">
                        {folderPath && (
                          <div>
                            <dt className="text-[var(--ink-faint)]">导入路径</dt>
                            <dd className="mt-0.5 break-all text-[10px] leading-relaxed">
                              {folderPath}
                            </dd>
                          </div>
                        )}
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--ink-faint)]">添加时间</dt>
                          <dd>{formatDate(data.createdAt)}</dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-[var(--ink-faint)]">更新时间</dt>
                          <dd>{formatDate(data.updatedAt)}</dd>
                        </div>
                        {data.captureDate && data.mediaType === "video" && (
                          <div className="flex justify-between gap-2">
                            <dt className="text-[var(--ink-faint)]">拍摄日期</dt>
                            <dd>{formatDate(data.captureDate)}</dd>
                          </div>
                        )}
                        {data.mediaType === "video" && (
                          <div className="flex justify-between gap-2">
                            <dt className="text-[var(--ink-faint)]">进度</dt>
                            <dd>{Math.round(data.progress * 100)}%</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  </>
                )}
                {isImageSequence && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
                      <span>观看进度</span>
                      <span className="tabular-nums">
                        {Math.round(data.progress * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
                      <div
                        className="h-full bg-[var(--accent-hot)] transition-[width] duration-200"
                        style={{ width: `${Math.min(100, data.progress * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <section className="min-w-0 space-y-6 animate-fade-up" style={{ animationDelay: "60ms" }}>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">标签</h2>
                <div className="flex items-center gap-2">
                  {isImageSequence && data.items.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void analyzeImageTags()}
                      disabled={aiTagging}
                      className="flex items-center gap-1 rounded-md border border-[var(--line)] bg-white px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50"
                      title={focusedItemId ? "识别当前选中的图片" : "识别第一张图片"}
                    >
                      {aiTagging ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      AI 识图标签
                    </button>
                  )}
                  <button
                    onClick={createAndApplyTag}
                    className="text-xs text-[var(--accent)] underline"
                  >
                    + 新建标签
                  </button>
                </div>
              </div>
              {aiTagMessage && (
                <p className="mb-2 text-xs text-[var(--ink-muted)]">{aiTagMessage}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const active = data.tags.some((t) => t.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs transition",
                        active
                          ? "text-white"
                          : "border border-[var(--line)] bg-white text-[var(--ink-muted)]"
                      )}
                      style={active ? { backgroundColor: tag.color } : undefined}
                    >
                      {tag.name}
                    </button>
                  );
                })}
                {tags.length === 0 && (
                  <span className="text-xs text-[var(--ink-faint)]">暂无标签</span>
                )}
              </div>
            </div>

            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">
                  内容列表 · {filteredItems.length}
                  {(itemRatingFilter !== 0 || normalizedSearch) && (
                    <span className="ml-1 font-normal text-[var(--ink-faint)]">
                      / {data.items.length}
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2">
                  {selectedItemIds.size > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--accent)]">已选 {selectedItemIds.size}</span>
                      <button
                        type="button"
                        onClick={() => { setGroupMode("create"); setGroupError(null); }}
                        className="flex h-8 items-center gap-1 rounded-md border border-[var(--line)] bg-white px-2 text-xs hover:text-[var(--accent)]"
                      >
                        <FolderPlus className="h-3.5 w-3.5" />新分组
                      </button>
                      <button
                        type="button"
                        onClick={() => { setGroupMode("move"); setGroupError(null); setGroupTargetId(""); }}
                        className="flex h-8 items-center gap-1 rounded-md border border-[var(--line)] bg-white px-2 text-xs hover:text-[var(--accent)]"
                      >
                        <FolderInput className="h-3.5 w-3.5" />移动到分组
                      </button>
                    </div>
                  )}
                  {autoImportMessage && (
                    <span className="text-xs text-[var(--accent)]">
                      {autoImportMessage}
                    </span>
                  )}
                  <div ref={sortMenuRef} className="relative">
                    <button
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={sortMenuOpen}
                      onClick={() => setSortMenuOpen((open) => !open)}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-white px-2.5 text-xs text-[var(--ink-muted)] transition hover:text-[var(--ink)]"
                    >
                      {itemSortDirection === "asc" ? (
                        <ArrowDownAZ className="h-3.5 w-3.5 text-[var(--accent)]" />
                      ) : (
                        <ArrowUpAZ className="h-3.5 w-3.5 text-[var(--accent)]" />
                      )}
                      <span>
                        排序：{itemSortOptions.find((option) => option.key === itemSortKey)?.label}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 transition-transform",
                          sortMenuOpen && "rotate-180"
                        )}
                      />
                    </button>
                    {sortMenuOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 top-full z-30 mt-1.5 w-40 overflow-hidden rounded-lg border border-[var(--line)] bg-white p-1 shadow-lg"
                      >
                        {itemSortOptions.map((option) => {
                          const Icon = option.icon;
                          const active = option.key === itemSortKey;
                          return (
                            <button
                              key={option.key}
                              type="button"
                              role="menuitem"
                              onClick={() => setItemSort(option.key)}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition",
                                active
                                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                                  : "text-[var(--ink-muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]"
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              <span className="flex-1">{option.label}</span>
                              {active &&
                                (itemSortDirection === "asc" ? (
                                  <ArrowDownAZ className="h-3.5 w-3.5" />
                                ) : (
                                  <ArrowUpAZ className="h-3.5 w-3.5" />
                                ))}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={toggleItemSortLock}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-white transition",
                      itemSortLocked
                        ? "text-[var(--accent)]"
                        : "text-[var(--ink-faint)] hover:text-[var(--ink)]"
                    )}
                    title={itemSortLocked ? "已锁定排序，点击取消" : "锁定当前排序"}
                    aria-label={itemSortLocked ? "取消锁定文件夹排序" : "锁定文件夹排序"}
                    aria-pressed={itemSortLocked}
                  >
                    {itemSortLocked ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      <LockOpen className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="flex h-9 min-w-[12rem] flex-1 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-2.5 focus-within:ring-2 focus-within:ring-[var(--accent)]">
                  <Search className="h-4 w-4 shrink-0 text-[var(--ink-faint)]" />
                  <input
                    type="search"
                    value={itemSearch}
                    onChange={(event) => setItemSearch(event.target.value)}
                    placeholder="搜索文件夹内容"
                    aria-label="搜索文件夹内容"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--ink-faint)]"
                  />
                  {itemSearch && (
                    <button type="button" onClick={() => setItemSearch("")} title="清除搜索" aria-label="清除搜索" className="text-[var(--ink-faint)] hover:text-[var(--ink)]">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <select
                  value={itemSearchField}
                  onChange={(event) => setItemSearchField(event.target.value as typeof itemSearchField)}
                  aria-label="搜索范围"
                  className="h-9 rounded-md border border-[var(--line)] bg-white px-2 text-xs text-[var(--ink-muted)] outline-none"
                >
                  <option value="all">全部信息</option>
                  <option value="name">名称</option>
                  <option value="path">路径</option>
                  <option value="date">日期</option>
                </select>
                <label className="flex h-9 items-center gap-1.5 rounded-md border border-[var(--line)] bg-white px-2 text-xs text-[var(--ink-muted)]">
                  <Filter className="h-3.5 w-3.5" />
                  <select
                    value={itemRatingFilter}
                    onChange={(event) => setItemRatingFilter(Number(event.target.value))}
                    aria-label="评分筛选"
                    className="bg-transparent text-xs outline-none"
                  >
                    <option value={0}>全部评分</option>
                    <option value={-1}>未评分</option>
                    <option value={5}>5 星</option>
                    <option value={4}>4 星及以上</option>
                    <option value={3}>3 星及以上</option>
                    <option value={2}>2 星及以上</option>
                    <option value={1}>1 星及以上</option>
                  </select>
                </label>
              </div>
              <div
                ref={listContainerRef}
                className="relative select-none"
                onMouseDown={onListMouseDown}
              >
              <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
                {sortedItems.map((item, idx) => {
                  const selected = selectedItemIds.has(item.id);
                  const focused = focusedItemId === item.id;
                  return (
                  <li
                    key={item.id}
                    data-item-row
                    ref={(el) => {
                      if (el) itemRefs.current.set(item.id, el);
                      else itemRefs.current.delete(item.id);
                    }}
                    className={cn(
                      selected && "bg-[var(--accent-soft)]/40",
                      focused && !selected && "bg-[var(--bg)]"
                    )}
                  >
                    <div className="flex items-center gap-2 px-3 py-3">
                      {(
                        <button
                          type="button"
                          aria-label={`${selected ? "取消选择" : "选择"} ${item.title}`}
                          aria-pressed={selected}
                          onClick={() => toggleItemSelect(item.id)}
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition",
                            selected
                              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                              : "border-[var(--line)] bg-white text-transparent"
                          )}
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleItemClick(item, e, orderedFilteredIds)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left transition hover:opacity-90"
                      >
                        <div
                          className={cn(
                            "relative shrink-0 overflow-hidden rounded-lg bg-[var(--accent-soft)]",
                            data.mediaType === "video" ? "h-14 w-24" : "h-12 w-10"
                          )}
                        >
                          {data.mediaType === "video" ? (
                            <VideoItemThumbnail
                              itemId={item.id}
                              title={item.title}
                              updatedAt={item.updatedAt}
                            />
                          ) : (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/thumbnails/item/${item.id}?t=${item.updatedAt}`}
                                alt=""
                                className="absolute inset-0 z-[1] h-full w-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                              <span className="absolute inset-0 z-0 flex items-center justify-center text-[var(--accent)]">
                                {data.mediaType === "photo" ? (
                              <ImageIcon className="h-4 w-4" />
                            ) : (
                              <BookOpen className="h-4 w-4" />
                            )}
                              </span>
                            </>
                          )}
                          {data.mediaType === "video" && (
                            <div className="absolute bottom-0 left-0 right-0 z-[2] h-1 bg-black/50">
                              <div
                                className="h-full bg-[var(--accent-hot)]"
                                style={{
                                  width: `${Math.min(100, item.progress * 100)}%`,
                                }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {idx + 1}. {item.title}
                          </p>
                          <p className="truncate text-xs text-[var(--ink-faint)]">
                            {formatBytes(item.fileSize)}
                            {item.duration != null && ` · ${formatDuration(item.duration)}`}
                            {data.mediaType === "video" &&
                              item.progress > 0 &&
                              ` · 已看 ${Math.round(item.progress * 100)}%`}
                          </p>
                          <p
                            className="truncate text-[10px] leading-4 text-[var(--ink-faint)]"
                            title={item.path}
                          >
                            {item.path}
                          </p>
                          <p
                            className="truncate text-[10px] leading-4 text-[var(--ink-faint)]"
                            title={`添加日期：${formatDate(item.fileCreatedAt)} · 修改日期：${formatDate(item.fileModifiedAt)}`}
                          >
                            添加日期：{formatDate(item.fileCreatedAt)} · 修改日期：
                            {formatDate(item.fileModifiedAt)}
                          </p>
                        </div>
                      </button>
                      <ItemRatingStars
                        rating={item.rating}
                        onRate={(r) => setItemRating(item.id, r)}
                      />
                    </div>
                  </li>
                  );
                })}
                {sortedItems.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-[var(--ink-faint)]">
                    {data.items.length === 0 ? "暂无内容项" : "没有符合筛选条件的条目"}
                  </li>
                )}
              </ul>
              {dragBoxStyle && (
                <div
                  className="pointer-events-none fixed z-50 border border-[var(--accent)] bg-[var(--accent)]/15"
                  style={dragBoxStyle}
                />
              )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
