package com.jerrydoko.resourcesmanager;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.List;

final class LibraryDb extends SQLiteOpenHelper {
    private static final String DB_NAME = "resources-manager.db";
    private static final int DB_VERSION = 1;

    LibraryDb(Context context) {
        super(context.getApplicationContext(), DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE media_items (" +
                "uri TEXT PRIMARY KEY," +
                "title TEXT NOT NULL," +
                "media_type TEXT NOT NULL," +
                "parent_name TEXT NOT NULL DEFAULT ''," +
                "mime_type TEXT NOT NULL DEFAULT ''," +
                "size INTEGER NOT NULL DEFAULT 0," +
                "added_at INTEGER NOT NULL DEFAULT 0," +
                "modified_at INTEGER NOT NULL DEFAULT 0," +
                "duration INTEGER NOT NULL DEFAULT 0," +
                "progress INTEGER NOT NULL DEFAULT 0" +
                ")");
        db.execSQL("CREATE INDEX media_items_type_idx ON media_items(media_type)");
        db.execSQL("CREATE INDEX media_items_added_idx ON media_items(added_at)");
        db.execSQL("CREATE INDEX media_items_modified_idx ON media_items(modified_at)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Versioned migrations are added here when the schema changes.
    }

    void upsert(MediaItem item) {
        SQLiteDatabase db = getWritableDatabase();
        ContentValues values = valuesFor(item);
        long inserted = db.insertWithOnConflict(
                "media_items", null, values, SQLiteDatabase.CONFLICT_IGNORE);
        if (inserted == -1) {
            values.remove("added_at");
            db.update("media_items", values, "uri = ?", new String[]{item.uri});
        }
    }

    List<MediaItem> query(String category, String search, String sortField, boolean ascending) {
        List<MediaItem> result = new ArrayList<>();
        List<String> selectionParts = new ArrayList<>();
        List<String> args = new ArrayList<>();
        if (category != null && !category.isEmpty()) {
            selectionParts.add("media_type = ?");
            args.add(category);
        }
        if (search != null && !search.trim().isEmpty()) {
            selectionParts.add("title LIKE ? ESCAPE '\\'");
            String escaped = search.trim().replace("\\", "\\\\")
                    .replace("%", "\\%").replace("_", "\\_");
            args.add("%" + escaped + "%");
        }
        String selection = selectionParts.isEmpty() ? null : String.join(" AND ", selectionParts);
        String safeSort;
        if ("added_at".equals(sortField)) {
            safeSort = "added_at";
        } else if ("modified_at".equals(sortField)) {
            safeSort = "modified_at";
        } else {
            safeSort = "title COLLATE NOCASE";
        }
        String orderBy = safeSort + (ascending ? " ASC" : " DESC") + ", title COLLATE NOCASE ASC";
        try (Cursor cursor = getReadableDatabase().query(
                "media_items", null, selection, args.toArray(new String[0]),
                null, null, orderBy)) {
            while (cursor.moveToNext()) {
                result.add(fromCursor(cursor));
            }
        }
        return result;
    }

    long getProgress(String uri) {
        try (Cursor cursor = getReadableDatabase().query(
                "media_items", new String[]{"progress"}, "uri = ?", new String[]{uri},
                null, null, null)) {
            return cursor.moveToFirst() ? cursor.getLong(0) : 0;
        }
    }

    void saveProgress(String uri, long progress) {
        ContentValues values = new ContentValues();
        values.put("progress", Math.max(progress, 0));
        getWritableDatabase().update("media_items", values, "uri = ?", new String[]{uri});
    }

    private static ContentValues valuesFor(MediaItem item) {
        ContentValues values = new ContentValues();
        values.put("uri", item.uri);
        values.put("title", item.title);
        values.put("media_type", item.mediaType);
        values.put("parent_name", item.parentName);
        values.put("mime_type", item.mimeType);
        values.put("size", item.size);
        values.put("added_at", item.addedAt);
        values.put("modified_at", item.modifiedAt);
        values.put("duration", item.duration);
        return values;
    }

    private static MediaItem fromCursor(Cursor cursor) {
        return new MediaItem(
                cursor.getString(cursor.getColumnIndexOrThrow("uri")),
                cursor.getString(cursor.getColumnIndexOrThrow("title")),
                cursor.getString(cursor.getColumnIndexOrThrow("media_type")),
                cursor.getString(cursor.getColumnIndexOrThrow("parent_name")),
                cursor.getString(cursor.getColumnIndexOrThrow("mime_type")),
                cursor.getLong(cursor.getColumnIndexOrThrow("size")),
                cursor.getLong(cursor.getColumnIndexOrThrow("added_at")),
                cursor.getLong(cursor.getColumnIndexOrThrow("modified_at")),
                cursor.getLong(cursor.getColumnIndexOrThrow("duration")),
                cursor.getLong(cursor.getColumnIndexOrThrow("progress")));
    }
}
