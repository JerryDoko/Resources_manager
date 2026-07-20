import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import fs from "fs";
import { ensureSeriesThumbnail, seriesThumbPath } from "@/lib/thumbnails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = getDb();
  const s = db.select().from(schema.series).where(eq(schema.series.id, id)).get();
  if (!s) {
    return NextResponse.json({ error: "未找到" }, { status: 404 });
  }

  let thumb = s.thumbnailPath;
  if (!thumb || !fs.existsSync(thumb)) {
    const items = db
      .select()
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.seriesId, id))
      .all();
    const source = items.find((i) => i.path)?.path;
    thumb = (await ensureSeriesThumbnail(id, source)) || seriesThumbPath(id);
    if (thumb && fs.existsSync(thumb)) {
      db.update(schema.series)
        .set({ thumbnailPath: thumb, updatedAt: Date.now() })
        .where(eq(schema.series.id, id))
        .run();
    }
  }

  if (!thumb || !fs.existsSync(thumb)) {
    return new NextResponse(null, { status: 404 });
  }

  const buf = fs.readFileSync(thumb);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
