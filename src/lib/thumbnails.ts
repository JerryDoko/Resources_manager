import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import sharp from "sharp";
import JSZip from "jszip";
import { getDataDir } from "@/lib/db";

const execFileAsync = promisify(execFile);

const IMAGE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".bmp",
  ".tiff",
]);

const VIDEO_EXTS = new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".m4v",
  ".k3g",
  ".3g2",
  ".3gp",
  ".skm",
  ".qt",
  ".ts",
  ".m2ts",
]);

export function getThumbnailsDir() {
  const dir = path.join(getDataDir(), "thumbnails");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function seriesThumbPath(seriesId: string) {
  return path.join(getThumbnailsDir(), `${seriesId}.webp`);
}

export function itemThumbPath(itemId: string) {
  return path.join(getThumbnailsDir(), `item-${itemId}.webp`);
}

async function writeThumb(buffer: Buffer, dest: string, maxSize = 480): Promise<string | null> {
  try {
    // 动图取第一帧做缩略图，原文件仍按原样流式播放
    await sharp(buffer, { animated: false, failOn: "none" })
      .rotate()
      .resize(maxSize, Math.round(maxSize * 1.4), {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 78 })
      .toFile(dest);
    return dest;
  } catch {
    return null;
  }
}

/** 将 data URL / base64 图写入缩略图文件（覆盖） */
export async function writeThumbFromDataUrl(
  dataUrl: string,
  dest: string
): Promise<string | null> {
  const m = dataUrl.match(/^data:image\/[\w+.-]+;base64,(.+)$/i);
  if (!m?.[1]) return null;
  try {
    const buf = Buffer.from(m[1], "base64");
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    return writeThumb(buf, dest);
  } catch {
    return null;
  }
}

async function fromImageFile(filePath: string, dest: string): Promise<string | null> {
  if (!fs.existsSync(filePath)) return null;
  try {
    const buf = fs.readFileSync(filePath);
    return writeThumb(buf, dest);
  } catch {
    return null;
  }
}

async function fromArchive(filePath: string, dest: string): Promise<string | null> {
  try {
    const buf = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buf);
    const images = Object.keys(zip.files)
      .filter((n) => {
        const lower = n.toLowerCase();
        return (
          !zip.files[n].dir &&
          !lower.includes("__macosx") &&
          IMAGE_EXTS.has(path.extname(lower))
        );
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (!images.length) return null;
    const pageBuf = Buffer.from(await zip.files[images[0]].async("uint8array"));
    return writeThumb(pageBuf, dest);
  } catch {
    return null;
  }
}

async function fromEpub(filePath: string, dest: string): Promise<string | null> {
  try {
    const buf = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(buf);

    const names = Object.keys(zip.files);
    const coverCandidates = names
      .filter((n) => {
        const lower = n.toLowerCase();
        return (
          !zip.files[n].dir &&
          IMAGE_EXTS.has(path.extname(lower)) &&
          (lower.includes("cover") || lower.includes("thumbnail") || /cover/i.test(path.basename(n)))
        );
      })
      .sort((a, b) => a.length - b.length);

    let pick = coverCandidates[0];

    if (!pick) {
      const opf = names.find((n) => n.toLowerCase().endsWith(".opf"));
      if (opf) {
        const opfText = await zip.files[opf].async("string");
        const coverId =
          opfText.match(/name="cover"\s+content="([^"]+)"/i)?.[1] ||
          opfText.match(/properties="[^"]*cover-image[^"]*"[^>]*id="([^"]+)"/i)?.[1];
        if (coverId) {
          const href =
            opfText.match(new RegExp(`id="${coverId}"[^>]*href="([^"]+)"`, "i"))?.[1] ||
            opfText.match(new RegExp(`href="([^"]+)"[^>]*id="${coverId}"`, "i"))?.[1];
          if (href) {
            const opfDir = path.posix.dirname(opf.replace(/\\/g, "/"));
            const resolved = path.posix.normalize(
              opfDir === "." ? href : `${opfDir}/${href}`
            );
            pick = names.find((n) => n.replace(/\\/g, "/") === resolved) || href;
          }
        }
      }
    }

    if (!pick) {
      pick = names
        .filter((n) => !zip.files[n].dir && IMAGE_EXTS.has(path.extname(n).toLowerCase()))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0];
    }

    if (!pick || !zip.files[pick]) return null;
    const imgBuf = Buffer.from(await zip.files[pick].async("uint8array"));
    return writeThumb(imgBuf, dest);
  } catch {
    return null;
  }
}

async function fromMusicCover(filePath: string, dest: string): Promise<string | null> {
  try {
    const { parseFile } = await import("music-metadata");
    const meta = await parseFile(filePath, { duration: false });
    const pic = meta.common.picture?.[0];
    if (!pic?.data) return null;
    return writeThumb(Buffer.from(pic.data), dest);
  } catch {
    return null;
  }
}

/** macOS Quick Look 抽帧；失败再试系统 ffmpeg */
async function fromVideoFile(filePath: string, dest: string): Promise<string | null> {
  if (!fs.existsSync(filePath)) return null;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rm-vthumb-"));
  try {
    try {
      await execFileAsync(
        "qlmanage",
        ["-t", "-s", "640", "-o", tmpDir, filePath],
        { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }
      );
      const pngs = fs.readdirSync(tmpDir).filter((f) => f.toLowerCase().endsWith(".png"));
      if (pngs.length) {
        const buf = fs.readFileSync(path.join(tmpDir, pngs[0]));
        return writeThumb(buf, dest);
      }
    } catch {
      /* try ffmpeg */
    }

    const outPng = path.join(tmpDir, "frame.png");
    try {
      await execFileAsync(
        "ffmpeg",
        ["-y", "-ss", "1", "-i", filePath, "-frames:v", "1", "-q:v", "2", outPng],
        { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }
      );
      if (fs.existsSync(outPng)) {
        return writeThumb(fs.readFileSync(outPng), dest);
      }
    } catch {
      return null;
    }
    return null;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Generate a thumbnail from a source media file into dest path. */
export async function generateThumbFromFile(
  sourcePath: string,
  destPath: string
): Promise<string | null> {
  const ext = path.extname(sourcePath).toLowerCase();

  if (IMAGE_EXTS.has(ext)) {
    return fromImageFile(sourcePath, destPath);
  }
  if (ext === ".zip" || ext === ".cbz") {
    return fromArchive(sourcePath, destPath);
  }
  if (ext === ".epub") {
    return fromEpub(sourcePath, destPath);
  }
  if ([".mp3", ".flac", ".m4a", ".aac", ".ogg", ".wav", ".wma", ".opus"].includes(ext)) {
    return fromMusicCover(sourcePath, destPath);
  }
  if (VIDEO_EXTS.has(ext)) {
    return fromVideoFile(sourcePath, destPath);
  }

  return null;
}

export async function ensureSeriesThumbnail(
  seriesId: string,
  sourcePath: string | null | undefined
): Promise<string | null> {
  if (!sourcePath) return null;
  const dest = seriesThumbPath(seriesId);
  if (fs.existsSync(dest)) {
    try {
      const srcStat = fs.statSync(sourcePath);
      const thumbStat = fs.statSync(dest);
      if (thumbStat.mtimeMs >= srcStat.mtimeMs) return dest;
    } catch {
      /* regenerate */
    }
  }
  return generateThumbFromFile(sourcePath, dest);
}

export async function ensureItemThumbnail(
  itemId: string,
  sourcePath: string
): Promise<string | null> {
  const dest = itemThumbPath(itemId);
  if (fs.existsSync(dest)) return dest;
  return generateThumbFromFile(sourcePath, dest);
}
