import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import fs from "fs";
import { ensureItemThumbnail } from "@/lib/thumbnails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = getDb();
  const item = db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, id)).get();
  if (!item) {
    return NextResponse.json({ error: "未找到" }, { status: 404 });
  }

  let thumb = item.thumbnailPath;
  if (!thumb || !fs.existsSync(thumb)) {
    thumb = await ensureItemThumbnail(id, item.path);
    if (thumb) {
      db.update(schema.mediaItems)
        .set({ thumbnailPath: thumb, updatedAt: Date.now() })
        .where(eq(schema.mediaItems.id, id))
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
