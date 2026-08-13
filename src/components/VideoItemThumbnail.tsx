"use client";

import { useCallback, useRef, useState } from "react";
import { Play } from "lucide-react";

interface Props {
  itemId: string;
  title: string;
  updatedAt: number;
}

let activeCaptures = 0;
const captureQueue: Array<() => void> = [];
const MAX_CAPTURES = 1;

async function withCaptureSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeCaptures >= MAX_CAPTURES) {
    await new Promise<void>((resolve) => captureQueue.push(resolve));
  }
  activeCaptures += 1;
  try {
    return await task();
  } finally {
    activeCaptures -= 1;
    captureQueue.shift()?.();
  }
}

function captureVideoFrame(itemId: string): Promise<string> {
  return withCaptureSlot(
    () =>
      new Promise<string>((resolve, reject) => {
        const video = document.createElement("video");
        const timeout = window.setTimeout(() => finish(new Error("视频首帧加载超时")), 20000);
        let finished = false;

        const cleanup = () => {
          window.clearTimeout(timeout);
          video.pause();
          video.removeAttribute("src");
          video.load();
        };
        const finish = (error?: Error, dataUrl?: string) => {
          if (finished) return;
          finished = true;
          cleanup();
          if (error || !dataUrl) reject(error || new Error("无法读取视频首帧"));
          else resolve(dataUrl);
        };

        video.muted = true;
        video.preload = "auto";
        video.playsInline = true;
        video.onloadedmetadata = () => {
          video.currentTime = Math.min(1, Math.max(0, video.duration * 0.05));
        };
        video.onseeked = () => {
          if (!video.videoWidth || !video.videoHeight) return;
          const width = Math.min(640, video.videoWidth);
          const height = Math.max(1, Math.round((width / video.videoWidth) * video.videoHeight));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) return finish(new Error("无法创建封面画布"));
          context.drawImage(video, 0, 0, width, height);
          finish(undefined, canvas.toDataURL("image/jpeg", 0.82));
        };
        video.onerror = () => finish(new Error("视频格式无法解码"));
        video.src = `/api/media/${encodeURIComponent(itemId)}`;
      })
  );
}

export function VideoItemThumbnail({ itemId, title, updatedAt }: Props) {
  const [src, setSrc] = useState(`/api/thumbnails/item/${itemId}?t=${updatedAt}`);
  const [failed, setFailed] = useState(false);
  const attemptedBrowserCapture = useRef(false);

  const recover = useCallback(async () => {
    if (attemptedBrowserCapture.current) {
      setFailed(true);
      return;
    }
    attemptedBrowserCapture.current = true;
    try {
      const dataUrl = await captureVideoFrame(itemId);
      const response = await fetch("/api/thumbnails/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, dataUrl, targets: ["item"] }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("保存封面失败");
      setSrc(`/api/thumbnails/item/${itemId}?t=${Date.now()}`);
    } catch {
      setFailed(true);
    }
  }, [itemId]);

  return (
    <>
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${title} 封面`}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 z-[1] h-full w-full object-cover"
          onError={recover}
        />
      )}
      <span className="absolute inset-0 z-0 flex items-center justify-center text-[var(--accent)]">
        <Play className="h-4 w-4" />
      </span>
    </>
  );
}
