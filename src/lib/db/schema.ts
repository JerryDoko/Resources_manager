import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";

export const libraryFolders = sqliteTable("library_folders", {
  id: text("id").primaryKey(),
  path: text("path").notNull().unique(),
  mediaType: text("media_type").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  recursive: integer("recursive", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").notNull(),
});

export const series = sqliteTable(
  "series",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    author: text("author"),
    mediaType: text("media_type").notNull(),
    rating: integer("rating").notNull().default(0),
    thumbnailPath: text("thumbnail_path"),
    itemCount: integer("item_count").notNull().default(0),
    manualGroup: integer("manual_group", { mode: "boolean" }).notNull().default(false),
    progress: real("progress").notNull().default(0),
    captureDate: text("capture_date"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("series_media_type_idx").on(t.mediaType),
    index("series_title_idx").on(t.title),
    index("series_author_idx").on(t.author),
    index("series_rating_idx").on(t.rating),
    index("series_capture_idx").on(t.captureDate),
  ]
);

export const mediaItems = sqliteTable(
  "media_items",
  {
    id: text("id").primaryKey(),
    seriesId: text("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    path: text("path").notNull().unique(),
    mediaType: text("media_type").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    duration: real("duration"),
    pageCount: integer("page_count"),
    fileSize: integer("file_size").notNull().default(0),
    captureDate: text("capture_date"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    progress: real("progress").notNull().default(0),
    rating: integer("rating").notNull().default(0),
    thumbnailPath: text("thumbnail_path"),
    metadata: text("metadata"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("items_series_idx").on(t.seriesId),
    index("items_media_type_idx").on(t.mediaType),
    index("items_capture_idx").on(t.captureDate),
    index("items_rating_idx").on(t.rating),
  ]
);

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#2a6f6f"),
  createdAt: integer("created_at").notNull(),
});

export const seriesTags = sqliteTable(
  "series_tags",
  {
    seriesId: text("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [index("series_tags_series_idx").on(t.seriesId), index("series_tags_tag_idx").on(t.tagId)]
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const novelSources = sqliteTable("novel_sources", {
  itemId: text("item_id").primaryKey().references(() => mediaItems.id, { onDelete: "cascade" }),
  sourceKey: text("source_key").notNull().unique(), kind: text("kind").notNull(), origin: text("origin"),
});
export const novelChapters = sqliteTable("novel_chapters", {
  id: text("id").primaryKey(), itemId: text("item_id").notNull().references(() => mediaItems.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(), title: text("title").notNull(), text: text("text").notNull(), digest: text("digest").notNull(),
  sourceUrl: text("source_url"), nextUrl: text("next_url"),
});
export const novelReadingState = sqliteTable("novel_reading_state", {
  itemId: text("item_id").primaryKey().references(() => mediaItems.id, { onDelete: "cascade" }),
  chapterId: text("chapter_id").notNull(), chunkId: text("chunk_id").notNull(), offset: integer("offset").notNull(),
  digest: text("digest").notNull(), seconds: real("seconds").notNull().default(0), chunkVersion: integer("chunk_version").notNull(), updatedAt: integer("updated_at").notNull(),
});
export const novelChapterComments = sqliteTable("novel_chapter_comments", {
  chapterId: text("chapter_id").primaryKey().references(() => novelChapters.id, { onDelete: "cascade" }),
  comments: text("comments").notNull(),
});
export const novelChapterProgress = sqliteTable("novel_chapter_progress", {
  itemId: text("item_id").notNull().references(() => mediaItems.id, { onDelete: "cascade" }),
  chapterId: text("chapter_id").notNull(), digest: text("digest").notNull(), progress: real("progress").notNull().default(0),
  offset: integer("offset").notNull().default(0), seconds: real("seconds").notNull().default(0), updatedAt: integer("updated_at").notNull(),
}, t=>[primaryKey({columns:[t.itemId,t.chapterId]})]);
