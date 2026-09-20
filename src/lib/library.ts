import { and, asc, desc, eq, like, or, sql, inArray } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { v4 as uuid } from "uuid";
import { getDb, getSqlite, schema } from "@/lib/db";
import type { MediaType, SortBy, TagMatchMode, AppSettings } from "@/lib/types";
import { DEFAULT_VIDEO_SHORTCUTS } from "@/lib/shortcuts";

export function listSeries(opts: {
  mediaType?: MediaType;
  search?: string;
  sortBy?: SortBy;
  tagIds?: string[];
  tagMatch?: TagMatchMode;
  limit?: number;
  offset?: number;
}) {
  const db = getDb();
  const {
    mediaType,
    search,
    sortBy = "title",
    tagIds,
    tagMatch = "any",
    limit = 200,
    offset = 0,
  } = opts;

  const conditions = [];
  if (mediaType) conditions.push(eq(schema.series.mediaType, mediaType));
  if (search) {
    const q = `%${search}%`;
    conditions.push(
      or(like(schema.series.title, q), like(schema.series.author, q))!
    );
  }

  let seriesIdsFilter: string[] | null = null;
  if (tagIds && tagIds.length > 0) {
    const rows = getSqlite()
      .prepare(
        tagMatch === "all"
          ? `SELECT series_id FROM series_tags WHERE tag_id IN (${tagIds.map(() => "?").join(",")})
             GROUP BY series_id HAVING COUNT(DISTINCT tag_id) = ?`
          : `SELECT DISTINCT series_id FROM series_tags WHERE tag_id IN (${tagIds.map(() => "?").join(",")})`
      )
      .all(...(tagMatch === "all" ? [...tagIds, tagIds.length] : tagIds)) as {
      series_id: string;
    }[];
    seriesIdsFilter = rows.map((r) => r.series_id);
    if (seriesIdsFilter.length === 0) return { items: [], total: 0 };
  }

  if (seriesIdsFilter) {
    conditions.push(inArray(schema.series.id, seriesIdsFilter));
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const orderMap = {
    title: asc(schema.series.title),
    rating: desc(schema.series.rating),
    author: asc(schema.series.author),
    updated: desc(schema.series.updatedAt),
    added: desc(schema.series.createdAt),
    capture: desc(schema.series.captureDate),
  } as const;

  const items = db
    .select()
    .from(schema.series)
    .where(where)
    .orderBy(orderMap[sortBy] ?? orderMap.updated)
    .limit(limit)
    .offset(offset)
    .all();

  const totalRow = db
    .select({ c: sql<number>`count(*)` })
    .from(schema.series)
    .where(where)
    .get();

  // Attach tags and folder paths
  const ids = items.map((i) => i.id);
  const tagMap = new Map<string, { id: string; name: string; color: string }[]>();
  const folderPathMap = new Map<string, string>();
  if (ids.length) {
    const tagRows = getSqlite()
      .prepare(
        `SELECT st.series_id, t.id, t.name, t.color
         FROM series_tags st JOIN tags t ON t.id = st.tag_id
         WHERE st.series_id IN (${ids.map(() => "?").join(",")})`
      )
      .all(...ids) as { series_id: string; id: string; name: string; color: string }[];

    for (const row of tagRows) {
      const list = tagMap.get(row.series_id) || [];
      list.push({ id: row.id, name: row.name, color: row.color });
      tagMap.set(row.series_id, list);
    }

    const pathRows = getSqlite()
      .prepare(
        `SELECT series_id, path FROM (
           SELECT
             series_id,
             path,
             ROW_NUMBER() OVER (
               PARTITION BY series_id
               ORDER BY sort_order, title
             ) AS rn
           FROM media_items
           WHERE series_id IN (${ids.map(() => "?").join(",")})
         )
         WHERE rn = 1`
      )
      .all(...ids) as { series_id: string; path: string }[];

    for (const row of pathRows) {
      if (!folderPathMap.has(row.series_id)) {
        folderPathMap.set(row.series_id, path.dirname(row.path));
      }
    }
  }

  return {
    items: items.map((s) => ({
      ...s,
      tags: tagMap.get(s.id) || [],
      folderPath: folderPathMap.get(s.id) ?? null,
    })),
    total: totalRow?.c ?? 0,
  };
}

export function getSeriesById(id: string) {
  const db = getDb();
  const s = db.select().from(schema.series).where(eq(schema.series.id, id)).get();
  if (!s) return null;

  const items = db
    .select()
    .from(schema.mediaItems)
    .where(eq(schema.mediaItems.seriesId, id))
    .orderBy(asc(schema.mediaItems.sortOrder), asc(schema.mediaItems.title))
    .all()
    .map((item) => {
      try {
        const stat = fs.statSync(item.path);
        return {
          ...item,
          fileCreatedAt: stat.birthtimeMs || stat.ctimeMs || item.createdAt,
          fileModifiedAt: stat.mtimeMs || item.updatedAt,
        };
      } catch {
        return {
          ...item,
          fileCreatedAt: item.createdAt,
          fileModifiedAt: item.updatedAt,
        };
      }
    });

  const tags = getSqlite()
    .prepare(
      `SELECT t.id, t.name, t.color FROM series_tags st
       JOIN tags t ON t.id = st.tag_id WHERE st.series_id = ?`
    )
    .all(id) as { id: string; name: string; color: string }[];

  return { ...s, items, tags };
}

export function updateSeries(
  id: string,
  data: Partial<{
    title: string;
    author: string | null;
    rating: number;
    thumbnailPath: string | null;
    progress: number;
  }>
) {
  const db = getDb();
  db.update(schema.series)
    .set({ ...data, updatedAt: Date.now() })
    .where(eq(schema.series.id, id))
    .run();
  return getSeriesById(id);
}

export function deleteSeries(id: string) {
  const db = getDb();
  db.delete(schema.series).where(eq(schema.series.id, id)).run();
}

/** 仅从库中移除系列索引，不删除磁盘文件 */
export function deleteSeriesMany(ids: string[]) {
  const db = getDb();
  let removed = 0;
  for (const id of ids) {
    const existed = db.select().from(schema.series).where(eq(schema.series.id, id)).get();
    if (!existed) continue;
    db.delete(schema.series).where(eq(schema.series.id, id)).run();
    removed++;
  }
  return { removed };
}

/** 将多个系列合并为一个新系列（条目迁移，原系列删除） */
export function mergeSeries(
  sourceIds: string[],
  title: string,
  author: string | null = null
) {
  const db = getDb();
  const now = Date.now();
  const unique = [...new Set(sourceIds)].filter(Boolean);
  if (unique.length < 2) throw new Error("请至少选择两个系列进行合并");

  const sources = unique
    .map((id) => db.select().from(schema.series).where(eq(schema.series.id, id)).get())
    .filter(Boolean);
  if (sources.length < 2) throw new Error("系列不存在或数量不足");

  const mediaType = sources[0]!.mediaType;
  if (!sources.every((s) => s!.mediaType === mediaType)) {
    throw new Error("只能合并相同媒体类型的系列");
  }

  const newId = uuid();
  db.insert(schema.series)
    .values({
      id: newId,
      title: title.trim() || sources[0]!.title,
      author: author ?? sources[0]!.author,
      mediaType,
      rating: Math.max(...sources.map((s) => s!.rating)),
      itemCount: 0,
      manualGroup: true,
      progress: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  let order = 0;
  for (const sid of unique) {
    const items = db
      .select()
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.seriesId, sid))
      .all()
      .sort((a, b) => a.sortOrder - b.sortOrder);
    for (const item of items) {
      db.update(schema.mediaItems)
        .set({ seriesId: newId, sortOrder: order++, updatedAt: now })
        .where(eq(schema.mediaItems.id, item.id))
        .run();
    }
    db.delete(schema.series).where(eq(schema.series.id, sid)).run();
  }

  const itemCount =
    db
      .select({ c: sql<number>`count(*)` })
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.seriesId, newId))
      .get()?.c ?? 0;

  db.update(schema.series)
    .set({ itemCount, updatedAt: now })
    .where(eq(schema.series.id, newId))
    .run();

  return getSeriesById(newId);
}

/** Move indexed items only; their on-disk paths are never changed. */
export function regroupItems(
  itemIds: string[],
  options: { sourceSeriesId: string; title?: string; targetSeriesId?: string }
) {
  const ids = [...new Set(itemIds)].filter(Boolean);
  if (!ids.length || ids.length > 10000) throw new Error("请选择要分组的文件");
  if (!!options.title === !!options.targetSeriesId) {
    throw new Error("请选择新建分组或已有分组");
  }

  const sqlite = getSqlite();
  const now = Date.now();
  const transaction = sqlite.transaction(() => {
    const source = sqlite.prepare("SELECT * FROM series WHERE id = ?").get(options.sourceSeriesId) as
      | { id: string; media_type: string; rating: number; author: string | null }
      | undefined;
    if (!source) throw new Error("原分组不存在");

    const rows = sqlite.prepare(
      `SELECT id, media_type FROM media_items WHERE series_id = ? AND id IN (${ids.map(() => "?").join(",")})`
    ).all(options.sourceSeriesId, ...ids) as { id: string; media_type: string }[];
    if (rows.length !== ids.length || rows.some((row) => row.media_type !== source.media_type)) {
      throw new Error("所选文件已变化，请刷新后重试");
    }

    let targetId = options.targetSeriesId;
    if (targetId) {
      const target = sqlite.prepare("SELECT id, media_type FROM series WHERE id = ?").get(targetId) as
        | { id: string; media_type: string }
        | undefined;
      if (!target || target.media_type !== source.media_type || target.id === source.id) {
        throw new Error("目标分组不存在或类型不匹配");
      }
    } else {
      const title = options.title?.trim() || "";
      if (!title || title.length > 120) throw new Error("分组名称须为 1 到 120 个字符");
      targetId = uuid();
      sqlite.prepare(
        `INSERT INTO series (id, title, author, media_type, rating, item_count, progress, manual_group, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, 1, ?, ?)`
      ).run(targetId, title, source.author, source.media_type, source.rating, now, now);
    }

    const nextOrder = (sqlite.prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM media_items WHERE series_id = ?"
    ).get(targetId) as { next_order: number }).next_order;
    const update = sqlite.prepare(
      "UPDATE media_items SET series_id = ?, sort_order = ?, updated_at = ? WHERE id = ?"
    );
    for (const [index, id] of ids.entries()) update.run(targetId, nextOrder + index, now, id);

    const remaining = (sqlite.prepare(
      "SELECT COUNT(*) AS count FROM media_items WHERE series_id = ?"
    ).get(source.id) as { count: number }).count;
    const recount = sqlite.prepare(
      `UPDATE series SET item_count = (SELECT COUNT(*) FROM media_items WHERE series_id = ?),
       progress = COALESCE((SELECT AVG(progress) FROM media_items WHERE series_id = ?), 0),
       thumbnail_path = NULL, updated_at = ? WHERE id = ?`
    );
    recount.run(targetId, targetId, now, targetId);
    if (remaining > 0) recount.run(source.id, source.id, now, source.id);
    if (remaining === 0) sqlite.prepare("DELETE FROM series WHERE id = ?").run(source.id);
    return { targetId, sourceRemoved: remaining === 0, moved: ids.length };
  });

  const moved = transaction();
  return moved;
}

export function updateItemProgress(id: string, progress: number) {
  const db = getDb();
  const now = Date.now();
  const clamped = Math.max(0, Math.min(1, progress));
  db.update(schema.mediaItems)
    .set({ progress: clamped, updatedAt: now })
    .where(eq(schema.mediaItems.id, id))
    .run();

  const item = db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, id)).get();
  if (item) {
    const items = db
      .select()
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.seriesId, item.seriesId))
      .all();
    const parent = db
      .select({ mediaType: schema.series.mediaType })
      .from(schema.series)
      .where(eq(schema.series.id, item.seriesId))
      .get();
    const isImageSequence = ["manga", "webtoon", "photo"].includes(
      parent?.mediaType ?? ""
    );
    const seriesProgress = isImageSequence
      ? clamped
      : items.length === 0
        ? 0
        : items.reduce((sum, i) => sum + i.progress, 0) / items.length;
    db.update(schema.series)
      .set({ progress: seriesProgress, updatedAt: now })
      .where(eq(schema.series.id, item.seriesId))
      .run();
  }
}

export function updateItemRating(id: string, rating: number) {
  const db = getDb();
  const now = Date.now();
  const clamped = Math.max(0, Math.min(5, Math.round(rating)));
  db.update(schema.mediaItems)
    .set({ rating: clamped, updatedAt: now })
    .where(eq(schema.mediaItems.id, id))
    .run();
  return db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, id)).get();
}

/** 批量重置系列内条目进度（及系列平均进度） */
export function resetSeriesProgress(seriesIds: string[]) {
  const db = getDb();
  const now = Date.now();
  let items = 0;
  for (const seriesId of seriesIds) {
    const r = db
      .update(schema.mediaItems)
      .set({ progress: 0, updatedAt: now })
      .where(eq(schema.mediaItems.seriesId, seriesId))
      .run();
    items += r.changes;
    db.update(schema.series)
      .set({ progress: 0, updatedAt: now })
      .where(eq(schema.series.id, seriesId))
      .run();
  }
  return { series: seriesIds.length, items };
}

/** 按系列顺序拼接条目，用于批量连续打开 */
export function listItemsForSeriesIds(seriesIds: string[]) {
  const db = getDb();
  const out: {
    id: string;
    title: string;
    path: string;
    seriesId: string;
    seriesTitle: string;
    mediaType: string;
    progress: number;
    sortOrder: number;
  }[] = [];

  for (const seriesId of seriesIds) {
    const s = db.select().from(schema.series).where(eq(schema.series.id, seriesId)).get();
    if (!s) continue;
    const items = db
      .select()
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.seriesId, seriesId))
      .all()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, undefined, { numeric: true }));
    for (const it of items) {
      out.push({
        id: it.id,
        title: it.title,
        path: it.path,
        seriesId: s.id,
        seriesTitle: s.title,
        mediaType: it.mediaType,
        progress: it.progress,
        sortOrder: it.sortOrder,
      });
    }
  }
  return out;
}

export function reorderItems(seriesId: string, orderedIds: string[]) {
  const db = getDb();
  const now = Date.now();
  const update = db.update(schema.mediaItems);
  orderedIds.forEach((id, index) => {
    update
      .set({ sortOrder: index, updatedAt: now })
      .where(and(eq(schema.mediaItems.id, id), eq(schema.mediaItems.seriesId, seriesId)))
      .run();
  });
}

export function listFolders() {
  return getDb().select().from(schema.libraryFolders).all();
}

export function addFolder(
  folderPath: string,
  mediaType: MediaType,
  recursive = true
) {
  const db = getDb();
  // 统一去掉尾部斜杠，避免同一路径因 `/` 差异被当成两条
  const normalized = folderPath.replace(/\/+$/, "") || folderPath;

  const existing =
    db
      .select()
      .from(schema.libraryFolders)
      .where(eq(schema.libraryFolders.path, normalized))
      .get() ||
    db
      .select()
      .from(schema.libraryFolders)
      .where(eq(schema.libraryFolders.path, normalized + "/"))
      .get();

  if (existing) {
    db.update(schema.libraryFolders)
      .set({ path: normalized, mediaType, enabled: true, recursive })
      .where(eq(schema.libraryFolders.id, existing.id))
      .run();
    return db
      .select()
      .from(schema.libraryFolders)
      .where(eq(schema.libraryFolders.id, existing.id))
      .get();
  }

  const id = uuid();
  db.insert(schema.libraryFolders)
    .values({
      id,
      path: normalized,
      mediaType,
      enabled: true,
      recursive,
      createdAt: Date.now(),
    })
    .run();
  return db.select().from(schema.libraryFolders).where(eq(schema.libraryFolders.id, id)).get();
}

export function updateFolderRecursive(id: string, recursive: boolean) {
  const db = getDb();
  db.update(schema.libraryFolders)
    .set({ recursive })
    .where(eq(schema.libraryFolders.id, id))
    .run();
  return db
    .select()
    .from(schema.libraryFolders)
    .where(eq(schema.libraryFolders.id, id))
    .get();
}

export function removeFolder(id: string) {
  getDb().delete(schema.libraryFolders).where(eq(schema.libraryFolders.id, id)).run();
}

export function listTags() {
  return getDb().select().from(schema.tags).orderBy(asc(schema.tags.name)).all();
}

export function createTag(name: string, color = "#2a6f6f") {
  const db = getDb();
  const id = uuid();
  db.insert(schema.tags)
    .values({ id, name, color, createdAt: Date.now() })
    .run();
  return db.select().from(schema.tags).where(eq(schema.tags.id, id)).get();
}

export function deleteTag(id: string) {
  getDb().delete(schema.tags).where(eq(schema.tags.id, id)).run();
}

export function setSeriesTags(seriesId: string, tagIds: string[]) {
  const sqlite = getSqlite();
  sqlite.prepare("DELETE FROM series_tags WHERE series_id = ?").run(seriesId);
  const insert = sqlite.prepare(
    "INSERT INTO series_tags (series_id, tag_id) VALUES (?, ?)"
  );
  const tx = sqlite.transaction((ids: string[]) => {
    for (const tagId of ids) insert.run(seriesId, tagId);
  });
  tx(tagIds);
}

export function applyTagToMany(seriesIds: string[], tagId: string) {
  const sqlite = getSqlite();
  const insert = sqlite.prepare(
    "INSERT OR IGNORE INTO series_tags (series_id, tag_id) VALUES (?, ?)"
  );
  const tx = sqlite.transaction((ids: string[]) => {
    for (const sid of ids) insert.run(sid, tagId);
  });
  tx(seriesIds);
}

const DEFAULT_SETTINGS: AppSettings = {
  remoteEnabled: false,
  remoteSubdomain: "resources",
  language: "zh-CN",
  thumbnailQuality: 80,
  autoScan: false,
  videoShortcuts: JSON.stringify(DEFAULT_VIDEO_SHORTCUTS),
  uiScale: 1,
  librarySortLocked: false,
  librarySortBy: "title",
  itemSortPreferences: {},
  aiEnabled: false,
  aiPermissionLevel: "read",
  aiApiBaseUrl: "http://127.0.0.1:11434/v1",
  aiVisionModel: "",
  aiApiKey: "",
  aiControlToken: "",
};

export function getSettings(): AppSettings {
  const rows = getDb().select().from(schema.settings).all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    remoteEnabled: map.remoteEnabled === "true",
    remoteSubdomain: map.remoteSubdomain || DEFAULT_SETTINGS.remoteSubdomain,
    language: map.language || DEFAULT_SETTINGS.language,
    thumbnailQuality: Number(map.thumbnailQuality ?? DEFAULT_SETTINGS.thumbnailQuality),
    autoScan: map.autoScan === "true",
    videoShortcuts: map.videoShortcuts || DEFAULT_SETTINGS.videoShortcuts,
    uiScale: Number(map.uiScale ?? DEFAULT_SETTINGS.uiScale) || 1,
    librarySortLocked: map.librarySortLocked === "true",
    librarySortBy: (["title", "rating", "author", "updated", "added", "capture"] as const).includes(
      map.librarySortBy as AppSettings["librarySortBy"]
    )
      ? (map.librarySortBy as AppSettings["librarySortBy"])
      : DEFAULT_SETTINGS.librarySortBy,
    itemSortPreferences: parseItemSortPreferences(map.itemSortPreferences),
    aiEnabled: map.aiEnabled === "true",
    aiPermissionLevel: (["read", "reversible", "dangerous"] as const).includes(
      map.aiPermissionLevel as AppSettings["aiPermissionLevel"]
    )
      ? (map.aiPermissionLevel as AppSettings["aiPermissionLevel"])
      : DEFAULT_SETTINGS.aiPermissionLevel,
    aiApiBaseUrl: map.aiApiBaseUrl || DEFAULT_SETTINGS.aiApiBaseUrl,
    aiVisionModel: map.aiVisionModel || "",
    aiApiKey: map.aiApiKey || "",
    aiControlToken: map.aiControlToken || "",
  };
}

function parseItemSortPreferences(value?: string): AppSettings["itemSortPreferences"] {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<
      string,
      { key?: unknown; direction?: unknown }
    >;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, preference]) =>
          ["name", "created", "updated"].includes(String(preference?.key)) &&
          ["asc", "desc"].includes(String(preference?.direction))
      )
    ) as AppSettings["itemSortPreferences"];
  } catch {
    return {};
  }
}

export function updateSettings(partial: Partial<AppSettings>) {
  const db = getDb();
  const current = getSettings();
  const next = { ...current, ...partial };
  if (next.aiEnabled && !next.aiControlToken) {
    next.aiControlToken = randomBytes(24).toString("hex");
  }
  for (const [key, value] of Object.entries(next)) {
    db.insert(schema.settings)
      .values({
        key,
        value:
          typeof value === "object" ? JSON.stringify(value) : String(value),
      })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: {
          value:
            typeof value === "object" ? JSON.stringify(value) : String(value),
        },
      })
      .run();
  }
  return next;
}

export function updateItemSortPreference(
  seriesId: string,
  preference: AppSettings["itemSortPreferences"][string] | null
) {
  const current = getSettings();
  const next = { ...current.itemSortPreferences };
  if (preference) next[seriesId] = preference;
  else delete next[seriesId];
  return updateSettings({ itemSortPreferences: next });
}

export function getLibraryStats() {
  const db = getDb();
  const byType = db
    .select({
      mediaType: schema.series.mediaType,
      count: sql<number>`count(*)`,
    })
    .from(schema.series)
    .groupBy(schema.series.mediaType)
    .all();

  const itemCount = db
    .select({ c: sql<number>`count(*)` })
    .from(schema.mediaItems)
    .get()?.c ?? 0;

  return {
    seriesByType: Object.fromEntries(byType.map((r) => [r.mediaType, r.count])),
    totalItems: itemCount,
    totalSeries: byType.reduce((s, r) => s + r.count, 0),
  };
}

export function exportBackup() {
  const db = getDb();
  return {
    version: 1,
    exportedAt: Date.now(),
    series: db.select().from(schema.series).all(),
    mediaItems: db.select().from(schema.mediaItems).all(),
    tags: db.select().from(schema.tags).all(),
    seriesTags: getSqlite().prepare("SELECT * FROM series_tags").all(),
    folders: db.select().from(schema.libraryFolders).all(),
    settings: db
      .select()
      .from(schema.settings)
      .all()
      .filter((setting) => !["aiApiKey", "aiControlToken"].includes(setting.key)),
  };
}

export function importBackup(data: ReturnType<typeof exportBackup>) {
  const sqlite = getSqlite();
  const tx = sqlite.transaction(() => {
    sqlite.exec(`
      DELETE FROM series_tags;
      DELETE FROM media_items;
      DELETE FROM series;
      DELETE FROM tags;
      DELETE FROM library_folders;
      DELETE FROM settings;
    `);

    const insertSeries = sqlite.prepare(`
      INSERT INTO series (id, title, author, media_type, rating, thumbnail_path, item_count, progress, capture_date, latitude, longitude, created_at, updated_at, manual_group)
      VALUES (@id, @title, @author, @mediaType, @rating, @thumbnailPath, @itemCount, @progress, @captureDate, @latitude, @longitude, @createdAt, @updatedAt, @manualGroup)
    `);
    for (const s of data.series) insertSeries.run({ ...s, manualGroup: (s as { manualGroup?: boolean }).manualGroup ?? false });

    const insertItem = sqlite.prepare(`
      INSERT INTO media_items (id, series_id, title, path, media_type, sort_order, duration, page_count, file_size, capture_date, latitude, longitude, progress, rating, thumbnail_path, metadata, created_at, updated_at)
      VALUES (@id, @seriesId, @title, @path, @mediaType, @sortOrder, @duration, @pageCount, @fileSize, @captureDate, @latitude, @longitude, @progress, @rating, @thumbnailPath, @metadata, @createdAt, @updatedAt)
    `);
    for (const i of data.mediaItems) {
      insertItem.run({ ...i, rating: (i as { rating?: number }).rating ?? 0 });
    }

    const insertTag = sqlite.prepare(
      `INSERT INTO tags (id, name, color, created_at) VALUES (@id, @name, @color, @createdAt)`
    );
    for (const t of data.tags) insertTag.run(t);

    const insertST = sqlite.prepare(
      `INSERT INTO series_tags (series_id, tag_id) VALUES (@series_id, @tag_id)`
    );
    for (const st of data.seriesTags as { series_id: string; tag_id: string }[]) {
      insertST.run(st);
    }

    const insertFolder = sqlite.prepare(`
      INSERT INTO library_folders (id, path, media_type, enabled, recursive, created_at)
      VALUES (@id, @path, @mediaType, @enabled, @recursive, @createdAt)
    `);
    for (const f of data.folders) {
      insertFolder.run({
        ...f,
        recursive: (f as { recursive?: boolean }).recursive ?? true,
      });
    }

    const insertSetting = sqlite.prepare(
      `INSERT INTO settings (key, value) VALUES (@key, @value)`
    );
    for (const s of data.settings) insertSetting.run(s);
  });
  tx();
}
