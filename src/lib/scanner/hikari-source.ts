import fs from "node:fs";
import path from "node:path";
import {
  HIKARI_DOWNLOAD_STATES,
  hikariSourceUrl,
  hikariStrings,
  hikariText,
  isRecord,
  type HikariSource,
} from "@/lib/hikari-metadata";

const SOURCE_FILE = /^hikari-source-([0-9a-f]{24})\.json$/;
export const MAX_HIKARI_JSON_BYTES = 16 * 1024 * 1024;

function inside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function localFile(root: string, value: unknown): string | null {
  if (typeof value !== "string" || !value || value.includes("\0") ||
      path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[a-z]:/i.test(value)) return null;
  const parts = value.split(/[\\/]/);
  if (parts.includes("..")) return null;
  const file = path.resolve(root, ...parts);
  if (!inside(root, file) || /\.(part|ytdl)$/i.test(file)) return null;
  try {
    if (!inside(fs.realpathSync(root), fs.realpathSync(file)) || !fs.statSync(file).isFile()) return null;
    return file;
  } catch {
    return null;
  }
}

function readJson(file: string): unknown {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_HIKARI_JSON_BYTES) return null;
    // Read at most the observed size plus one, even if a writer grows the file.
    const buffer = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(fd, buffer, length, buffer.length - length, null);
      if (!count) break;
      length += count;
    }
    if (length > stat.size) return null;
    return JSON.parse(buffer.subarray(0, length).toString("utf8"));
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** One cache per scan: sidecars are never executed, fetched, or modified. */
export function createHikariSourceReader() {
  const directories = new Map<string, Map<string, HikariSource[]>>();
  return (filePath: string): HikariSource[] => {
    const file = path.resolve(filePath);
    const folder = path.dirname(file);
    let index = directories.get(folder);
    if (!index) {
      index = new Map();
      directories.set(folder, index);
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(folder, { withFileTypes: true });
      } catch {
        return [];
      }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const match = SOURCE_FILE.exec(entry.name);
        if (!match || !entry.isFile()) continue;
        const data = readJson(path.join(folder, entry.name));
        if (!isRecord(data) || data.kind !== "hikari-download" || data.schema_version !== 1 ||
            data.source_id !== match[1] || !Array.isArray(data.files)) continue;
        const download = isRecord(data.download) ? data.download : {};
        const state = hikariText(download.state, 64);
        for (const item of data.files) {
          if (!isRecord(item)) continue;
          const target = localFile(folder, item.path);
          if (!target) continue;
          const source: HikariSource = {
            id: match[1],
            sourceUrl: hikariSourceUrl(item.source_url) || hikariSourceUrl(data.source_url),
            site: hikariText(data.site),
            title: hikariText(item.title) || hikariText(data.title),
            authors: hikariStrings(data.authors, item.authors),
            tags: hikariStrings(data.tags, data.user_tags, item.tags, item.user_tags),
            downloadState: Object.hasOwn(HIKARI_DOWNLOAD_STATES, state) ? state : "",
            updatedAt: hikariText(data.updated_at, 128),
          };
          const sources = index.get(target) || [];
          if (!sources.some((existing) => existing.id === source.id)) sources.push(source);
          index.set(target, sources);
        }
      }
    }
    return index.get(file) || [];
  };
}
