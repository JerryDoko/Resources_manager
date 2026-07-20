import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Auto-detect sidecar .srt / .vtt next to the video */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = getDb();
  const item = db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, id)).get();
  if (!item) {
    return NextResponse.json({ error: "未找到" }, { status: 404 });
  }

  const dir = path.dirname(item.path);
  const base = path.basename(item.path, path.extname(item.path));
  const candidates = [
    path.join(dir, `${base}.vtt`),
    path.join(dir, `${base}.srt`),
    path.join(dir, `${base}.en.vtt`),
    path.join(dir, `${base}.en.srt`),
  ];

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    let content = fs.readFileSync(p, "utf-8");
    const ext = path.extname(p).toLowerCase();

    if (ext === ".srt") {
      content = srtToVtt(content);
    }

    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  return new NextResponse("WEBVTT\n\n", {
    headers: { "Content-Type": "text/vtt; charset=utf-8" },
  });
}

function srtToVtt(srt: string): string {
  const body = srt
    .replace(/\r+/g, "")
    .replace(/^\d+\n/gm, "")
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return `WEBVTT\n\n${body}`;
}
