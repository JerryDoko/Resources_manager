export const NOVEL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS novel_sources (
 item_id TEXT PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE,
 source_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, origin TEXT
);
CREATE TABLE IF NOT EXISTS novel_chapters (
 id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL, digest TEXT NOT NULL,
 source_url TEXT, next_url TEXT, UNIQUE(item_id, source_url)
);
CREATE INDEX IF NOT EXISTS novel_chapters_item_idx ON novel_chapters(item_id, ordinal);
CREATE TABLE IF NOT EXISTS novel_reading_state (
 item_id TEXT PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE,
 chapter_id TEXT NOT NULL, chunk_id TEXT NOT NULL, offset INTEGER NOT NULL,
 digest TEXT NOT NULL, seconds REAL NOT NULL DEFAULT 0, chunk_version INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS novel_chapter_progress (
 item_id TEXT NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
 chapter_id TEXT NOT NULL, digest TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0,
 offset INTEGER NOT NULL DEFAULT 0, seconds REAL NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
 PRIMARY KEY(item_id, chapter_id)
);`;
