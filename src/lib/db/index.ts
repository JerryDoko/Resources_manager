import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "library.db");

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;

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
}

export function getDb() {
  if (_db) return _db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const thumbsDir = path.join(DATA_DIR, "thumbnails");
  if (!fs.existsSync(thumbsDir)) {
    fs.mkdirSync(thumbsDir, { recursive: true });
  }

  _sqlite = new Database(DB_PATH);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");
  ensureSchema(_sqlite);

  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function getSqlite() {
  getDb();
  return _sqlite!;
}

export function getDataDir() {
  return DATA_DIR;
}

export function getDbPath() {
  return DB_PATH;
}

export { schema };
