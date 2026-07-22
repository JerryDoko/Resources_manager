import { NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  itemThumbPath,
  seriesThumbPath,
  writeThumbFromDataUrl,
} from "@/lib/thumbnails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 播放器截帧：保存为条目缩略图和/或系列封面
 * body: { itemId, dataUrl, targets: ("item"|"series")[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const itemId = String(body.itemId || "");
    const dataUrl = String(body.dataUrl || "");
    const targets = (body.targets || []) as string[];

    if (!itemId || !dataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "参数无效" }, { status: 400 });
    }
    if (!targets.length) {
      return NextResponse.json({ error: "未指定目标" }, { status: 400 });
    }

    const db = getDb();
    const item = db
      .select()
      .from(schema.mediaItems)
      .where(eq(schema.mediaItems.id, itemId))
      .get();
    if (!item) {
      return NextResponse.json({ error: "条目不存在" }, { status: 404 });
    }

    const now = Date.now();
    const result: { item?: string; series?: string } = {};

    if (targets.includes("item")) {
      const dest = itemThumbPath(itemId);
      const saved = await writeThumbFromDataUrl(dataUrl, dest);
      if (!saved) {
        return NextResponse.json({ error: "写入条目缩略图失败" }, { status: 500 });
      }
      db.update(schema.mediaItems)
        .set({ thumbnailPath: saved, updatedAt: now })
        .where(eq(schema.mediaItems.id, itemId))
        .run();
      result.item = saved;
    }

    if (targets.includes("series")) {
      const dest = seriesThumbPath(item.seriesId);
      const saved = await writeThumbFromDataUrl(dataUrl, dest);
      if (!saved) {
        return NextResponse.json({ error: "写入系列封面失败" }, { status: 500 });
      }
      db.update(schema.series)
        .set({ thumbnailPath: saved, updatedAt: now })
        .where(eq(schema.series.id, item.seriesId))
        .run();
      result.series = saved;
    }

    return NextResponse.json({ ok: true, ...result, updatedAt: now });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
