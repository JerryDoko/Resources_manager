package com.jerrydoko.resourcesmanager;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.text.TextUtils;
import android.webkit.MimeTypeMap;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;

final class DeviceScanner {
    private DeviceScanner() {}

    static int scanMediaStore(Context context, LibraryDb db) {
        int count = 0;
        count += scanCollection(context, db, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image", false);
        count += scanCollection(context, db, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "video", true);
        count += scanCollection(context, db, MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, "audio", true);
        return count;
    }

    static int scanTree(Context context, LibraryDb db, Uri treeUri) {
        String rootId = DocumentsContract.getTreeDocumentId(treeUri);
        Deque<Folder> pending = new ArrayDeque<>();
        pending.add(new Folder(rootId, "已授权文件夹"));
        int count = 0;
        while (!pending.isEmpty()) {
            Folder folder = pending.removeFirst();
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, folder.documentId);
            try (Cursor cursor = context.getContentResolver().query(children, new String[]{
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE,
                    DocumentsContract.Document.COLUMN_SIZE,
                    DocumentsContract.Document.COLUMN_LAST_MODIFIED
            }, null, null, null)) {
                if (cursor == null) continue;
                while (cursor.moveToNext()) {
                    String id = value(cursor, DocumentsContract.Document.COLUMN_DOCUMENT_ID);
                    String name = value(cursor, DocumentsContract.Document.COLUMN_DISPLAY_NAME);
                    String mime = value(cursor, DocumentsContract.Document.COLUMN_MIME_TYPE);
                    if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                        pending.addLast(new Folder(id, TextUtils.isEmpty(name) ? folder.name : name));
                        continue;
                    }
                    String mediaType = classify(mime, name);
                    if (mediaType == null) continue;
                    Uri uri = DocumentsContract.buildDocumentUriUsingTree(treeUri, id);
                    long now = System.currentTimeMillis();
                    db.upsert(new MediaItem(
                            uri.toString(), name, mediaType, folder.name, mime,
                            longValue(cursor, DocumentsContract.Document.COLUMN_SIZE),
                            now,
                            longValue(cursor, DocumentsContract.Document.COLUMN_LAST_MODIFIED),
                            0,
                            0));
                    count++;
                }
            } catch (RuntimeException ignored) {
                // A provider may deny one nested folder while allowing the rest of the tree.
            }
        }
        return count;
    }

    private static int scanCollection(
            Context context, LibraryDb db, Uri collection, String mediaType, boolean hasDuration) {
        String[] projection;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            projection = hasDuration
                    ? new String[]{MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME,
                    MediaStore.MediaColumns.MIME_TYPE, MediaStore.MediaColumns.SIZE,
                    MediaStore.MediaColumns.DATE_ADDED, MediaStore.MediaColumns.DATE_MODIFIED,
                    MediaStore.MediaColumns.RELATIVE_PATH, MediaStore.MediaColumns.DURATION}
                    : new String[]{MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME,
                    MediaStore.MediaColumns.MIME_TYPE, MediaStore.MediaColumns.SIZE,
                    MediaStore.MediaColumns.DATE_ADDED, MediaStore.MediaColumns.DATE_MODIFIED,
                    MediaStore.MediaColumns.RELATIVE_PATH};
        } else {
            projection = hasDuration
                    ? new String[]{MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME,
                    MediaStore.MediaColumns.MIME_TYPE, MediaStore.MediaColumns.SIZE,
                    MediaStore.MediaColumns.DATE_ADDED, MediaStore.MediaColumns.DATE_MODIFIED,
                    MediaStore.MediaColumns.DURATION}
                    : new String[]{MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME,
                    MediaStore.MediaColumns.MIME_TYPE, MediaStore.MediaColumns.SIZE,
                    MediaStore.MediaColumns.DATE_ADDED, MediaStore.MediaColumns.DATE_MODIFIED};
        }
        int count = 0;
        ContentResolver resolver = context.getContentResolver();
        try (Cursor cursor = resolver.query(collection, projection, null, null, null)) {
            if (cursor == null) return 0;
            while (cursor.moveToNext()) {
                long id = longValue(cursor, MediaStore.MediaColumns._ID);
                String name = value(cursor, MediaStore.MediaColumns.DISPLAY_NAME);
                String mime = value(cursor, MediaStore.MediaColumns.MIME_TYPE);
                String parent = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ? value(cursor, MediaStore.MediaColumns.RELATIVE_PATH) : "设备媒体库";
                Uri uri = ContentUris.withAppendedId(collection, id);
                db.upsert(new MediaItem(
                        uri.toString(), name, mediaType, parent, mime,
                        longValue(cursor, MediaStore.MediaColumns.SIZE),
                        secondsToMillis(longValue(cursor, MediaStore.MediaColumns.DATE_ADDED)),
                        secondsToMillis(longValue(cursor, MediaStore.MediaColumns.DATE_MODIFIED)),
                        hasDuration ? longValue(cursor, MediaStore.MediaColumns.DURATION) : 0,
                        0));
                count++;
            }
        } catch (SecurityException ignored) {
            // A denied media category should not prevent already-authorized categories from loading.
        }
        return count;
    }

    private static long secondsToMillis(long value) {
        return value > 0 ? value * 1000L : 0;
    }

    private static String classify(String mime, String name) {
        if (mime != null) {
            if (mime.startsWith("image/")) return "image";
            if (mime.startsWith("video/")) return "video";
            if (mime.startsWith("audio/")) return "audio";
            if (mime.equals("application/pdf") || mime.equals("application/epub+zip")
                    || mime.startsWith("text/")) return "document";
        }
        String extension = MimeTypeMap.getFileExtensionFromUrl(name == null ? "" : name)
                .toLowerCase(Locale.ROOT);
        switch (extension) {
            case "epub":
            case "pdf":
            case "txt":
            case "md":
            case "cbz":
            case "cbr":
                return "document";
            default:
                return null;
        }
    }

    private static String value(Cursor cursor, String column) {
        int index = cursor.getColumnIndex(column);
        return index >= 0 && !cursor.isNull(index) ? cursor.getString(index) : "";
    }

    private static long longValue(Cursor cursor, String column) {
        int index = cursor.getColumnIndex(column);
        return index >= 0 && !cursor.isNull(index) ? cursor.getLong(index) : 0;
    }

    private static final class Folder {
        final String documentId;
        final String name;

        Folder(String documentId, String name) {
            this.documentId = documentId;
            this.name = name;
        }
    }
}
