"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { DEFAULT_VIDEO_PREFERENCES, isVideoPreferences, type VideoPreferences } from "./video-preferences";

type PendingSave = { itemId: string; profileId: string; preferences: VideoPreferences };

// Reopening a viewer must wait for its previous instance's pending save.
let queuedVideoPreferenceSaves = Promise.resolve();

export function useVideoPreferences(itemId: string, videoRef: RefObject<HTMLVideoElement | null>) {
  const [preferences, setPreferences] = useState<VideoPreferences>(DEFAULT_VIDEO_PREFERENCES);
  const [readyItemId, setReadyItemId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"loading" | "saved" | "saving" | "error">("loading");
  const profileRef = useRef<string | null>(null);
  const currentItemRef = useRef(itemId);
  currentItemRef.current = itemId;
  const preferencesRef = useRef(preferences);
  const pendingRef = useRef<PendingSave | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    // Keep rapid slider saves ordered, including a pending save when switching videos.
    queuedVideoPreferenceSaves = queuedVideoPreferenceSaves.then(async () => {
      try {
        const response = await fetch(`/api/items/${pending.itemId}/playback`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pending),
          signal: AbortSignal.timeout(10000),
          keepalive: true,
        });
        if (!response.ok) throw new Error("保存失败");
        if (mounted.current && currentItemRef.current === pending.itemId && !pendingRef.current &&
            preferencesRef.current.volume === pending.preferences.volume &&
            preferencesRef.current.playbackRate === pending.preferences.playbackRate) setSaveStatus("saved");
      } catch {
        if (mounted.current && currentItemRef.current === pending.itemId) setSaveStatus("error");
      }
    });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setReadyItemId(null);
    setSaveStatus("loading");
    profileRef.current = null;
    videoRef.current?.pause();
    const apply = (next: VideoPreferences) => {
      preferencesRef.current = next;
      setPreferences(next);
      const video = videoRef.current;
      if (video) {
        video.volume = next.volume;
        video.defaultPlaybackRate = next.playbackRate;
        video.playbackRate = next.playbackRate;
      }
      setReadyItemId(itemId);
    };
    queuedVideoPreferenceSaves.then(() => {
      if (controller.signal.aborted) throw new Error("取消读取");
      return fetch(`/api/items/${itemId}/playback`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        cache: "no-store",
      });
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("读取失败");
        const data = await response.json();
        if (!isVideoPreferences(data.preferences) || typeof data.profileId !== "string") throw new Error("参数无效");
        if (controller.signal.aborted) return;
        profileRef.current = data.profileId;
        apply(data.preferences);
        setSaveStatus("saved");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        apply({ ...DEFAULT_VIDEO_PREFERENCES });
        setSaveStatus("error");
      });
    return () => {
      controller.abort();
      flush();
    };
  }, [itemId, videoRef, flush]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [flush]);

  const updatePreferences = useCallback((changes: Partial<VideoPreferences>) => {
    const next = { ...preferencesRef.current, ...changes };
    if (!isVideoPreferences(next) || readyItemId !== itemId) return;
    preferencesRef.current = next;
    setPreferences(next);
    const video = videoRef.current;
    if (video) {
      video.volume = next.volume;
      video.muted = false;
      video.defaultPlaybackRate = next.playbackRate;
      video.playbackRate = next.playbackRate;
    }
    if (!profileRef.current) return;
    pendingRef.current = { itemId, profileId: profileRef.current, preferences: next };
    setSaveStatus("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 400);
  }, [itemId, readyItemId, videoRef, flush]);

  return { preferences, readyItemId, saveStatus, updatePreferences };
}
