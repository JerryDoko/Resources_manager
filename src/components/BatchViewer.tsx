"use client";

import { useLibrary } from "@/lib/store";
import { MangaReader } from "@/components/viewers/MangaReader";
import { VideoPlayer } from "@/components/viewers/VideoPlayer";

/** 多选连续打开：相册/视频列表拼成一条播放队列 */
export function BatchViewer() {
  const { batchSession, setBatchCurrentId, closeBatchSession } = useLibrary();
  if (!batchSession || batchSession.items.length === 0) return null;

  const current = batchSession.items.find((i) => i.id === batchSession.currentId);
  if (!current) return null;

  if (batchSession.mediaType === "photo") {
    return (
      <MangaReader
        itemId={batchSession.currentId}
        title={`${current.seriesTitle} · ${current.title}`}
        mediaType="manga"
        playlist={batchSession.items.map((i) => ({
          id: i.id,
          title: `${i.seriesTitle} · ${i.title}`,
          path: i.path,
        }))}
        onChangeItem={setBatchCurrentId}
        onClose={closeBatchSession}
      />
    );
  }

  return (
    <VideoPlayer
      itemId={batchSession.currentId}
      title={`${current.seriesTitle} · ${current.title}`}
      initialProgress={current.progress}
      playlist={batchSession.items.map((i) => ({
        id: i.id,
        title: `${i.seriesTitle} · ${i.title}`,
        progress: i.progress,
      }))}
      onChangeItem={setBatchCurrentId}
      onClose={closeBatchSession}
    />
  );
}
