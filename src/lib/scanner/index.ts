import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { eq, and, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { MEDIA_EXTENSIONS, type MediaType, type ScanResult } from "@/lib/types";
import { inferSeriesTitle, naturalCompare, parseMediaName } from "@/lib/parsers/name";
import { ensureItemThumbnail, ensureSeriesThumbnail } from "@/lib/thumbnails";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic", ".bmp", ".tiff"]);
const ARCHIVE_EXTS = new Set([".zip", ".cbz", ".rar", ".cbr"]);

function getExt(file: string): string {
  return path.extname(file).toLowerCase();
}

function isDirEntry(entry: fs.Dirent, full: string): boolean {
  if (entry.isDirectory()) return true;
  // 跟随指向目录的符号链接（访达里常见）
  if (entry.isSymbolicLink()) {
    try {
      return fs.statSync(full).isDirectory();
    } catch {
      return false;
    }
  }
  return false;
}

function walkDir(dir: string, maxDepth = 32, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (isDirEntry(entry, full)) {
      results.push(...walkDir(full, maxDepth, depth + 1));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      try {
        if (fs.statSync(full).isFile()) results.push(full);
      } catch {
        /* 忽略不可读文件 */
      }
    }
  }
  return results;
}

function matchMediaType(filePath: string, preferred: MediaType): MediaType | null {
  const ext = getExt(filePath);
  if (MEDIA_EXTENSIONS[preferred].includes(ext)) return preferred;

  for (const [type, exts] of Object.entries(MEDIA_EXTENSIONS) as [MediaType, string[]][]) {
    if (exts.includes(ext)) return type;
  }
  return null;
}

function isLooseImageManga(files: string[], root: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const f of files) {
    if (!IMAGE_EXTS.has(getExt(f))) continue;
    const parent = path.dirname(f);
    if (parent === root) continue;
    const list = groups.get(parent) || [];
    list.push(f);
    groups.set(parent, list);
  }
  return groups;
}

/** Episode / volume folder names like 01, 01-hash, ep02, 第1话 */
export function isEpisodeOrVolumeFolder(name: string): boolean {
  const n = name.trim();
  if (/^(ep|episode|ch|chapter|vol|volume)\.?\s*\d+/i.test(n)) return true;
  if (/^第?\s*\d+\s*[话話卷章集话]/u.test(n)) return true;
  if (/^\d{1,4}([\-_.].*)?$/i.test(n)) return true;
  return false;
}

/**
 * Resolve series folder from an image-containing folder.
 * Series > Episode > images  → series = Series
 * Series > images            → series = Series
 * 会沿目录向上跳过多层「话/卷」文件夹。
 */
export function resolveSeriesFromImageFolder(
  imageFolder: string,
  libraryRoot: string
): { seriesFolder: string; episodeLabel: string | null } {
  const root = libraryRoot.replace(/\/$/, "");
  let current = imageFolder;
  let episodeLabel: string | null = null;

  while (current !== root && current !== "." && current !== "/") {
    const name = path.basename(current);
    const parent = path.dirname(current);
    if (parent === current) break;

    if (isEpisodeOrVolumeFolder(name) && parent !== root) {
      if (!episodeLabel) episodeLabel = name;
      current = parent;
      continue;
    }
    break;
  }

  return { seriesFolder: current, episodeLabel };
}

export async function scanFolder(
  folderPath: string,
  mediaType: MediaType
): Promise<ScanResult> {
  const result: ScanResult = {
    scanned: 0,
    added: 0,
    updated: 0,
    seriesCreated: 0,
    errors: [],
  };

  if (!fs.existsSync(folderPath)) {
    result.errors.push(`路径不存在: ${folderPath}`);
    return result;
  }

  const db = getDb();
  const now = Date.now();
  const allFiles = walkDir(folderPath);
  const matched = allFiles.filter((f) => matchMediaType(f, mediaType) === mediaType);
  result.scanned = matched.length;

  const touchedSeries = new Set<string>();

  if (mediaType === "manga" || mediaType === "webtoon" || mediaType === "photo") {
    const imageGroups = isLooseImageManga(matched, folderPath);
    const archiveAndOthers = matched.filter(
      (f) => ARCHIVE_EXTS.has(getExt(f)) || !IMAGE_EXTS.has(getExt(f))
    );

    for (const filePath of archiveAndOthers) {
      try {
        const seriesId = await upsertFileAsItem(
          db,
          filePath,
          mediaType,
          now,
          result,
          folderPath,
          false
        );
        if (seriesId) touchedSeries.add(seriesId);
      } catch (e) {
        result.errors.push(`${filePath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    for (const [folder, images] of imageGroups) {
      try {
        images.sort(naturalCompare);
        const { seriesFolder, episodeLabel } = resolveSeriesFromImageFolder(folder, folderPath);
        const folderName = path.basename(seriesFolder);
        const parsed = parseMediaName(folderName);
        const seriesId = await findOrCreateSeries(
          db,
          parsed.title,
          parsed.author,
          mediaType,
          now,
          result
        );
        touchedSeries.add(seriesId);

        let order =
          db
            .select({ c: sql<number>`count(*)` })
            .from(schema.mediaItems)
            .where(eq(schema.mediaItems.seriesId, seriesId))
            .get()?.c ?? 0;

        for (const img of images) {
          const existing = db
            .select()
            .from(schema.mediaItems)
            .where(eq(schema.mediaItems.path, img))
            .get();

          if (existing) {
            result.updated++;
            continue;
          }

          const stat = fs.statSync(img);
          const itemId = uuid();
          const baseTitle = path.basename(img, path.extname(img));
          const title = episodeLabel ? `${episodeLabel} · ${baseTitle}` : baseTitle;

          // 扫描阶段跳过逐张缩略图，避免大库超时；展示时再懒生成
          db.insert(schema.mediaItems)
            .values({
              id: itemId,
              seriesId,
              title,
              path: img,
              mediaType,
              sortOrder: order++,
              fileSize: stat.size,
              captureDate:
                mediaType === "photo"
                  ? new Date(stat.mtimeMs).toISOString().slice(0, 10)
                  : null,
              thumbnailPath: null,
              createdAt: now,
              updatedAt: now,
            })
            .run();
          result.added++;
        }
      } catch (e) {
        result.errors.push(`${folder}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (mediaType === "photo") {
      const rootImages = matched.filter(
        (f) => IMAGE_EXTS.has(getExt(f)) && path.dirname(f) === folderPath
      );
      for (const img of rootImages) {
        try {
          const seriesId = await upsertFileAsItem(
            db,
            img,
            mediaType,
            now,
            result,
            folderPath,
            false
          );
          if (seriesId) touchedSeries.add(seriesId);
        } catch (e) {
          result.errors.push(`${img}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  } else {
    for (const filePath of matched) {
      try {
        const seriesId = await upsertFileAsItem(
          db,
          filePath,
          mediaType,
          now,
          result,
          folderPath,
          false
        );
        if (seriesId) touchedSeries.add(seriesId);
      } catch (e) {
        result.errors.push(`${filePath}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  for (const seriesId of touchedSeries) {
    await refreshSeriesStats(db, seriesId, now);
  }

  return result;
}

async function upsertFileAsItem(
  db: ReturnType<typeof getDb>,
  filePath: string,
  mediaType: MediaType,
  now: number,
  result: ScanResult,
  libraryRoot?: string,
  makeThumb = true
): Promise<string | null> {
  const existing = db
    .select()
    .from(schema.mediaItems)
    .where(eq(schema.mediaItems.path, filePath))
    .get();

  if (existing) {
    result.updated++;
    if (makeThumb && !existing.thumbnailPath) {
      const thumb = await ensureItemThumbnail(existing.id, filePath);
      if (thumb) {
        db.update(schema.mediaItems)
          .set({ thumbnailPath: thumb, updatedAt: now })
          .where(eq(schema.mediaItems.id, existing.id))
          .run();
      }
    }
    return existing.seriesId;
  }

  const fileName = path.basename(filePath);
  const parsed = inferSeriesTitle(filePath, fileName, libraryRoot);
  const seriesId = await findOrCreateSeries(db, parsed.title, parsed.author, mediaType, now, result);
  const stat = fs.statSync(filePath);

  let metadata: string | null = null;
  let duration: number | null = null;
  let captureDate: string | null = null;

  if (mediaType === "music") {
    try {
      const { parseFile } = await import("music-metadata");
      const meta = await parseFile(filePath, { duration: true });
      duration = meta.format.duration ?? null;
      const artist = meta.common.artist || parsed.author;
      const album = meta.common.album || parsed.title;
      metadata = JSON.stringify({
        artist,
        album,
        title: meta.common.title || path.basename(filePath, path.extname(filePath)),
        year: meta.common.year,
      });
      if (artist || album) {
        db.update(schema.series)
          .set({
            title: album || parsed.title,
            author: artist || parsed.author,
            updatedAt: now,
          })
          .where(eq(schema.series.id, seriesId))
          .run();
      }
    } catch {
      /* ignore */
    }
  }

  if (mediaType === "video" || mediaType === "photo") {
    captureDate = new Date(stat.mtimeMs).toISOString().slice(0, 10);
  }

  const itemCount =
    db
      .select({ c: sql<number>`count(*)` })
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.seriesId, seriesId))
      .get()?.c ?? 0;

  const itemId = uuid();
  const thumb = makeThumb ? await ensureItemThumbnail(itemId, filePath) : null;

  db.insert(schema.mediaItems)
    .values({
      id: itemId,
      seriesId,
      title: path.basename(filePath, path.extname(filePath)),
      path: filePath,
      mediaType,
      sortOrder: itemCount,
      duration,
      fileSize: stat.size,
      captureDate,
      metadata,
      thumbnailPath: thumb,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  result.added++;
  return seriesId;
}

async function findOrCreateSeries(
  db: ReturnType<typeof getDb>,
  title: string,
  author: string | null,
  mediaType: MediaType,
  now: number,
  result: ScanResult
): Promise<string> {
  const conditions = author
    ? and(
        eq(schema.series.title, title),
        eq(schema.series.author, author),
        eq(schema.series.mediaType, mediaType)
      )
    : and(eq(schema.series.title, title), eq(schema.series.mediaType, mediaType));

  const existing = db.select().from(schema.series).where(conditions).get();
  if (existing) return existing.id;

  const id = uuid();
  db.insert(schema.series)
    .values({
      id,
      title,
      author,
      mediaType,
      rating: 0,
      itemCount: 0,
      progress: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  result.seriesCreated++;
  return id;
}

async function refreshSeriesStats(
  db: ReturnType<typeof getDb>,
  seriesId: string,
  now: number
) {
  const items = db
    .select()
    .from(schema.mediaItems)
    .where(eq(schema.mediaItems.seriesId, seriesId))
    .all()
    .sort((a, b) => a.sortOrder - b.sortOrder || naturalCompare(a.title, b.title));

  const sourceForThumb =
    items.find((i) => i.thumbnailPath)?.path ||
    items.find((i) => IMAGE_EXTS.has(getExt(i.path)) || ARCHIVE_EXTS.has(getExt(i.path)) || getExt(i.path) === ".epub")
      ?.path ||
    items[0]?.path ||
    null;

  const seriesThumb = await ensureSeriesThumbnail(seriesId, sourceForThumb);

  const captureDates = items.map((i) => i.captureDate).filter(Boolean) as string[];
  const earliestCapture = captureDates.sort()[0] || null;
  const withGps = items.find((i) => i.latitude != null && i.longitude != null);

  db.update(schema.series)
    .set({
      itemCount: items.length,
      thumbnailPath: seriesThumb,
      captureDate: earliestCapture,
      latitude: withGps?.latitude ?? null,
      longitude: withGps?.longitude ?? null,
      updatedAt: now,
    })
    .where(eq(schema.series.id, seriesId))
    .run();
}

export async function regenerateAllThumbnails(): Promise<{
  series: number;
  items: number;
  errors: string[];
}> {
  const db = getDb();
  const now = Date.now();
  const errors: string[] = [];
  let seriesCount = 0;
  let itemCount = 0;

  const items = db.select().from(schema.mediaItems).all();
  for (const item of items) {
    try {
      const thumb = await ensureItemThumbnail(item.id, item.path);
      if (thumb && thumb !== item.thumbnailPath) {
        db.update(schema.mediaItems)
          .set({ thumbnailPath: thumb, updatedAt: now })
          .where(eq(schema.mediaItems.id, item.id))
          .run();
        itemCount++;
      } else if (thumb) {
        itemCount++;
      }
    } catch (e) {
      errors.push(`${item.path}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const allSeries = db.select().from(schema.series).all();
  for (const s of allSeries) {
    try {
      await refreshSeriesStats(db, s.id, now);
      seriesCount++;
    } catch (e) {
      errors.push(`series ${s.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { series: seriesCount, items: itemCount, errors };
}

export async function scanAllFolders(): Promise<ScanResult> {
  const db = getDb();
  const folders = db
    .select()
    .from(schema.libraryFolders)
    .where(eq(schema.libraryFolders.enabled, true))
    .all();

  const aggregate: ScanResult = {
    scanned: 0,
    added: 0,
    updated: 0,
    seriesCreated: 0,
    errors: [],
  };

  for (const folder of folders) {
    const r = await scanFolder(folder.path, folder.mediaType as MediaType);
    aggregate.scanned += r.scanned;
    aggregate.added += r.added;
    aggregate.updated += r.updated;
    aggregate.seriesCreated += r.seriesCreated;
    aggregate.errors.push(...r.errors);
  }

  return aggregate;
}
