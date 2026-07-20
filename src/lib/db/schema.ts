import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

export const libraryFolders = sqliteTable("library_folders", {
  id: text("id").primaryKey(),
  path: text("path").notNull().unique(),
  mediaType: text("media_type").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
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
    thumbnailPath: text("thumbnail_path"),
    metadata: text("metadata"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("items_series_idx").on(t.seriesId),
    index("items_media_type_idx").on(t.mediaType),
    index("items_capture_idx").on(t.captureDate),
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
