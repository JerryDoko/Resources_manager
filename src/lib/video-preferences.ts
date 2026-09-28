export interface VideoPreferences {
  volume: number;
  playbackRate: number;
}

export const DEFAULT_VIDEO_PREFERENCES: VideoPreferences = {
  volume: 1,
  playbackRate: 1,
};

export function isVideoPreferences(value: unknown): value is VideoPreferences {
  if (!value || typeof value !== "object") return false;
  const prefs = value as Record<string, unknown>;
  return typeof prefs.volume === "number" && Number.isFinite(prefs.volume) &&
    prefs.volume >= 0 && prefs.volume <= 1 &&
    typeof prefs.playbackRate === "number" && Number.isFinite(prefs.playbackRate) &&
    prefs.playbackRate >= 0.25 && prefs.playbackRate <= 3;
}

export function parseItemMetadata(raw: string | null): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function readVideoPreferences(metadata: Record<string, unknown>): VideoPreferences {
  return isVideoPreferences(metadata.videoPreferences)
    ? metadata.videoPreferences
    : { ...DEFAULT_VIDEO_PREFERENCES };
}
