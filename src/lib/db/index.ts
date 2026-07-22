import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "./schema";
import {
  applyDefaultOnBoot,
  getActiveProfileId,
  getProfileDataDir,
} from "@/lib/profiles";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;
let _boundProfileId: string | null = null;
let _booted = false;

function ensureSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS library_folders (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      media_type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS series (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      media_type TEXT NOT NULL,
      rating INTEGER NOT NULL DEFAULT 0,
      thumbnail_path TEXT,
      item_count INTEGER NOT NULL DEFAULT 0,
      progress REAL NOT NULL DEFAULT 0,
      capture_date TEXT,
      latitude REAL,
      longitude REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS series_media_type_idx ON series(media_type);
    CREATE INDEX IF NOT EXISTS series_title_idx ON series(title);
    CREATE INDEX IF NOT EXISTS series_author_idx ON series(author);
    CREATE INDEX IF NOT EXISTS series_rating_idx ON series(rating);
    CREATE INDEX IF NOT EXISTS series_capture_idx ON series(capture_date);

    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY,
      series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      media_type TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      duration REAL,
      page_count INTEGER,
      file_size INTEGER NOT NULL DEFAULT 0,
      capture_date TEXT,
      latitude REAL,
      longitude REAL,
      progress REAL NOT NULL DEFAULT 0,
      rating INTEGER NOT NULL DEFAULT 0,
      thumbnail_path TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS items_series_idx ON media_items(series_id);
    CREATE INDEX IF NOT EXISTS items_media_type_idx ON media_items(media_type);
    CREATE INDEX IF NOT EXISTS items_capture_idx ON media_items(capture_date);

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#2a6f6f',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS series_tags (
      series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (series_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS series_tags_series_idx ON series_tags(series_id);
    CREATE INDEX IF NOT EXISTS series_tags_tag_idx ON series_tags(tag_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const itemCols = sqlite
    .prepare("PRAGMA table_info(media_items)")
    .all() as { name: string }[];
  if (!itemCols.some((c) => c.name === "rating")) {
    sqlite.exec(
      "ALTER TABLE media_items ADD COLUMN rating INTEGER NOT NULL DEFAULT 0"
    );
  }
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS items_rating_idx ON media_items(rating)"
  );
}

function bootOnce() {
  if (_booted) return;
  _booted = true;
  // 桌面端启动时注入该变量，每次打开应用进入「默认配置」
  if (process.env.RESOURCES_MANAGER_APPLY_DEFAULT === "1") {
    try {
      applyDefaultOnBoot();
    } catch {
      /* ignore */
    }
  }
}

export function closeDb() {
  if (_sqlite) {
    try {
      _sqlite.close();
    } catch {
      /* ignore */
    }
  }
  _sqlite = null;
  _db = null;
  _boundProfileId = null;
}

export function getDb() {
  bootOnce();
  const profileId = getActiveProfileId();
  if (_db && _boundProfileId === profileId) return _db;

  if (_db && _boundProfileId !== profileId) {
    closeDb();
  }

  const dataDir = getProfileDataDir(profileId);
  const dbPath = path.join(dataDir, "library.db");

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const thumbsDir = path.join(dataDir, "thumbnails");
  if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir, { recursive: true });
  }

  _sqlite = new Database(dbPath);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");
  ensureSchema(_sqlite);

  _db = drizzle(_sqlite, { schema });
  _boundProfileId = profileId;
  return _db;
}

export function getSqlite() {
  getDb();
  return _sqlite!;
}

export function getDataDir() {
  bootOnce();
  return getProfileDataDir(getActiveProfileId());
}

export function getDbPath() {
  return path.join(getDataDir(), "library.db");
}

export { schema };
