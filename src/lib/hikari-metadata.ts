export interface HikariSource {
  id: string;
  sourceUrl: string;
  site: string;
  title: string;
  authors: string[];
  tags: string[];
  downloadState: string;
  updatedAt: string;
}

export const HIKARI_DOWNLOAD_STATES = {
  queued: "等待下载",
  downloading: "下载中",
  paused: "已暂停",
  interrupted: "下载已中断",
  waiting_verification: "等待验证",
  cancelled: "已取消",
  failed: "下载失败",
  completed: "下载已完成",
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hikariText(value: unknown, limit = 2048): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

export function hikariStrings(...values: unknown[]): string[] {
  return [...new Set(values.flatMap((value) =>
    Array.isArray(value)
      ? value.slice(0, 512).map((entry) => hikariText(entry, 512)).filter(Boolean)
      : []
  ))];
}

export function hikariSourceUrl(value: unknown): string {
  const text = hikariText(value, 8192);
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? text
      : "";
  } catch {
    return "";
  }
}

export function readHikariSources(metadata: string | null): HikariSource[] {
  try {
    const parsed: unknown = JSON.parse(metadata || "{}");
    if (!isRecord(parsed) || !isRecord(parsed.hikari) || !Array.isArray(parsed.hikari.sources)) return [];
    return parsed.hikari.sources.filter(isRecord).filter((source) =>
      typeof source.id === "string" && /^[0-9a-f]{24}$/.test(source.id)
    ).map((source) => ({
      id: source.id as string,
      sourceUrl: hikariSourceUrl(source.sourceUrl),
      site: hikariText(source.site),
      title: hikariText(source.title),
      authors: hikariStrings(source.authors),
      tags: hikariStrings(source.tags),
      downloadState: hikariText(source.downloadState, 64),
      updatedAt: hikariText(source.updatedAt, 128),
    }));
  } catch {
    return [];
  }
}
