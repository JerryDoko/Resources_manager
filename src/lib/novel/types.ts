export const CHUNK_VERSION = 1;
export const RATES = [0.75, 1, 1.25, 1.5, 2];
export const PREVIEW_TEXT = "他说：“你先回去，明天我们再谈。”夜色渐深，窗外的风轻轻掠过树梢。";
export interface NovelPreferences {
  version: 1; engine: "kokoro" | "system"; voiceId: number;
  rate: number; volume: number; previousVolume: number; follow: boolean;
}
export const DEFAULT_PREFERENCES: NovelPreferences = { version: 1, engine: "kokoro", voiceId: 3, rate: 1, volume: 1, previousVolume: 1, follow: true };
export interface Chunk { id: string; start: number; end: number; text: string; speech: string; digest: string; block?: string }
export interface Chapter { id: string; title: string; text: string; digest: string; chunks: Chunk[]; html?: string; sourceURL?: string; nextURL?: string }
export interface Position { chapterId: string; chunkId: string; offset: number; digest: string; seconds: number; chunkVersion: number }
export interface NovelBook { itemId: string; profileId: string; title: string; format: "txt" | "epub"; chapters: { id: string; title: string }[]; preferences: NovelPreferences; position: Position | null; encoding?: string; notice?: string }
export interface Clip { url: string; cached: boolean; duration: number; elapsed: number }
