package com.jerrydoko.resourcesmanager;

final class MediaItem {
    final String uri;
    final String title;
    final String mediaType;
    final String parentName;
    final String mimeType;
    final long size;
    final long addedAt;
    final long modifiedAt;
    final long duration;
    final long progress;

    MediaItem(
            String uri,
            String title,
            String mediaType,
            String parentName,
            String mimeType,
            long size,
            long addedAt,
            long modifiedAt,
            long duration,
            long progress) {
        this.uri = uri;
        this.title = title;
        this.mediaType = mediaType;
        this.parentName = parentName;
        this.mimeType = mimeType;
        this.size = size;
        this.addedAt = addedAt;
        this.modifiedAt = modifiedAt;
        this.duration = duration;
        this.progress = progress;
    }
}
