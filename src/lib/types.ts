export type MediaType =
  | "manga"
  | "webtoon"
  | "novel"
  | "video"
  | "music"
  | "photo";

export type SortBy = "title" | "rating" | "author" | "updated" | "added" | "capture";

export type TagMatchMode = "all" | "any";

export interface LibraryFolder {
  id: string;
  path: string;
  mediaType: MediaType;
  enabled: boolean;
  createdAt: number;
}

export interface Series {
  id: string;
  title: string;
  author: string | null;
  mediaType: MediaType;
  rating: number;
  thumbnailPath: string | null;
  itemCount: number;
  progress: number;
  captureDate: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface MediaItem {
  id: string;
  seriesId: string;
  title: string;
  path: string;
  mediaType: MediaType;
  sortOrder: number;
  duration: number | null;
  pageCount: number | null;
  fileSize: number;
  captureDate: string | null;
  latitude: number | null;
  longitude: number | null;
  progress: number;
  rating: number;
  thumbnailPath: string | null;
  metadata: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface AppSettings {
  remoteEnabled: boolean;
  remoteSubdomain: string;
  language: string;
  thumbnailQuality: number;
  autoScan: boolean;
  /** JSON string of VideoShortcuts */
  videoShortcuts: string;
  /** 界面缩放 0.85 | 1 | 1.1 | 1.25 */
  uiScale: number;
}

export type LibraryViewMode = "import" | "series";

export interface ScanResult {
  scanned: number;
  added: number;
  updated: number;
  seriesCreated: number;
  errors: string[];
}

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  manga: "漫画",
  webtoon: "条漫",
  novel: "小说",
  video: "视频",
  music: "音乐",
  photo: "照片",
};

export const MEDIA_EXTENSIONS: Record<MediaType, string[]> = {
  manga: [".zip", ".cbz", ".rar", ".cbr", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"],
  webtoon: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".zip", ".cbz"],
  novel: [".txt", ".epub", ".pdf"],
  video: [
    ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v",
    ".k3g", ".3g2", ".3gp", ".skm", ".qt", ".ts", ".m2ts",
  ],
  music: [".mp3", ".flac", ".aac", ".m4a", ".wav", ".ogg", ".wma", ".opus"],
  photo: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".avif", ".tiff", ".bmp"],
};
