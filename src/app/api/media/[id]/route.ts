import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { decodeNovelBuffer, type NovelEncoding } from "@/lib/encoding";
import { parseEpub, readEpubChapter } from "@/lib/epub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".apng": "image/apng",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
  ".epub": "application/epub+zip",
};

function readRange(
  filePath: string,
  size: number,
  rangeHeader: string | null,
  contentType: string
) {
  let start = 0;
  let end = size - 1;
  let status = 200;

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      start = parseInt(match[1], 10);
      end = match[2] ? parseInt(match[2], 10) : Math.min(start + 2 * 1024 * 1024 - 1, size - 1);
      status = 206;
    }
  } else if (size > 2 * 1024 * 1024) {
    // Encourage range for large files
    end = Math.min(1024 * 1024 - 1, size - 1);
    status = 206;
  }

  end = Math.min(end, size - 1);
  const chunkSize = end - start + 1;
  const chunk = Buffer.alloc(chunkSize);
  const fd = fs.openSync(filePath, "r");
  fs.readSync(fd, chunk, 0, chunkSize, start);
  fs.closeSync(fd);

  const headers: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Content-Length": String(chunkSize),
    "Content-Type": contentType,
  };
  if (status === 206) {
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  return new NextResponse(chunk, { status, headers });
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = getDb();
  const item = db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, id)).get();
  if (!item) {
    return NextResponse.json({ error: "未找到" }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const mode = sp.get("mode");
  const ext = path.extname(item.path).toLowerCase();

  if (mode === "meta") {
    return NextResponse.json({
      ...item,
      format: ext.replace(".", "") || "unknown",
      exists: fs.existsSync(item.path),
    });
  }

  if (!fs.existsSync(item.path)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }

  // Archive pages listing / page extract
  if ((ext === ".zip" || ext === ".cbz") && (mode === "pages" || mode === "page")) {
    const buf = fs.readFileSync(item.path);
    const zip = await JSZip.loadAsync(buf);
    const images = Object.keys(zip.files)
      .filter(
        (n) =>
          /\.(jpe?g|png|webp|gif|avif|apng|bmp)$/i.test(n) &&
          !zip.files[n].dir &&
          !n.includes("__MACOSX")
      )
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (mode === "pages") {
      return NextResponse.json({ pages: images, count: images.length });
    }

    const pageIndex = Number(sp.get("i") || 0);
    const name = images[pageIndex];
    if (!name) {
      return NextResponse.json({ error: "页码无效" }, { status: 400 });
    }
    const pageBuf = Buffer.from(await zip.files[name].async("uint8array"));
    const pageExt = path.extname(name).toLowerCase();
    return new NextResponse(pageBuf, {
      headers: {
        "Content-Type": MIME[pageExt] || "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  // EPUB: table of contents
  if (mode === "epub" && ext === ".epub") {
    try {
      const book = await parseEpub(item.path);
      return NextResponse.json(book);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "EPUB 解析失败" },
        { status: 500 }
      );
    }
  }

  // EPUB: chapter content
  if (mode === "epub-chapter" && ext === ".epub") {
    const href = sp.get("href");
    if (!href) {
      return NextResponse.json({ error: "缺少 href" }, { status: 400 });
    }
    try {
      const chapter = await readEpubChapter(item.path, href, "html");
      const asText = sp.get("as") === "text";
      if (asText) {
        return new NextResponse(chapter.text, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      return new NextResponse(chapter.html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "章节读取失败" },
        { status: 500 }
      );
    }
  }

  // Novel TXT with smart encoding detection
  if (mode === "text") {
    if (ext === ".txt") {
      const buf = fs.readFileSync(item.path);
      const forced = (sp.get("encoding") as NovelEncoding | null) || null;
      const result = decodeNovelBuffer(buf, forced);
      return new NextResponse(result.text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "X-Detected-Encoding": result.encoding,
          "X-Encoding-Confidence": result.confidence,
        },
      });
    }
    return NextResponse.json(
      { error: "mode=text 仅支持 TXT；EPUB 请用 mode=epub，PDF 请直接拉取文件流" },
      { status: 400 }
    );
  }

  const stat = fs.statSync(item.path);
  const contentType = MIME[ext] || "application/octet-stream";
  const range = req.headers.get("range");
  const isAv = item.mediaType === "video" || item.mediaType === "music";
  const isPdf = ext === ".pdf";

  if (isAv || isPdf) {
    return readRange(item.path, stat.size, range, contentType);
  }

  // Full file for images / small documents
  const buf = fs.readFileSync(item.path);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": "private, max-age=3600",
      "Accept-Ranges": "bytes",
    },
  });
}
