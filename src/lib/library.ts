import { and, asc, desc, eq, like, or, sql, inArray } from "drizzle-orm";
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
    sortBy = "updated",
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

  // Attach tags
  const ids = items.map((i) => i.id);
  const tagMap = new Map<string, { id: string; name: string; color: string }[]>();
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
  }

  return {
    items: items.map((s) => ({ ...s, tags: tagMap.get(s.id) || [] })),
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
    .all();

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

export function updateItemProgress(id: string, progress: number) {
  const db = getDb();
  const now = Date.now();
  db.update(schema.mediaItems)
    .set({ progress, updatedAt: now })
    .where(eq(schema.mediaItems.id, id))
    .run();

  const item = db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, id)).get();
  if (item) {
    const items = db
      .select()
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.seriesId, item.seriesId))
      .all();
    const avg =
      items.length === 0
        ? 0
        : items.reduce((s, i) => s + (i.id === id ? progress : i.progress), 0) / items.length;
    db.update(schema.series)
      .set({ progress: avg, updatedAt: now })
      .where(eq(schema.series.id, item.seriesId))
      .run();
  }
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

export function addFolder(folderPath: string, mediaType: MediaType) {
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
      .set({ path: normalized, mediaType, enabled: true })
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
      createdAt: Date.now(),
    })
    .run();
  return db.select().from(schema.libraryFolders).where(eq(schema.libraryFolders.id, id)).get();
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
  };
}

export function updateSettings(partial: Partial<AppSettings>) {
  const db = getDb();
  const current = getSettings();
  const next = { ...current, ...partial };
  for (const [key, value] of Object.entries(next)) {
    db.insert(schema.settings)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: String(value) },
      })
      .run();
  }
  return next;
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
    settings: db.select().from(schema.settings).all(),
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
      INSERT INTO series (id, title, author, media_type, rating, thumbnail_path, item_count, progress, capture_date, latitude, longitude, created_at, updated_at)
      VALUES (@id, @title, @author, @mediaType, @rating, @thumbnailPath, @itemCount, @progress, @captureDate, @latitude, @longitude, @createdAt, @updatedAt)
    `);
    for (const s of data.series) insertSeries.run(s);

    const insertItem = sqlite.prepare(`
      INSERT INTO media_items (id, series_id, title, path, media_type, sort_order, duration, page_count, file_size, capture_date, latitude, longitude, progress, thumbnail_path, metadata, created_at, updated_at)
      VALUES (@id, @seriesId, @title, @path, @mediaType, @sortOrder, @duration, @pageCount, @fileSize, @captureDate, @latitude, @longitude, @progress, @thumbnailPath, @metadata, @createdAt, @updatedAt)
    `);
    for (const i of data.mediaItems) insertItem.run(i);

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
      INSERT INTO library_folders (id, path, media_type, enabled, created_at)
      VALUES (@id, @path, @mediaType, @enabled, @createdAt)
    `);
    for (const f of data.folders) insertFolder.run(f);

    const insertSetting = sqlite.prepare(
      `INSERT INTO settings (key, value) VALUES (@key, @value)`
    );
    for (const s of data.settings) insertSetting.run(s);
  });
  tx();
}
