import { NextRequest, NextResponse } from "next/server";
import {
  updateItemProgress,
  updateItemRating,
  reorderItems,
  resetSeriesProgress,
  listItemsForSeriesIds,
  deleteSeriesMany,
  regroupItems,
} from "@/lib/library";
import { getDb } from "@/lib/db";
import { refreshSeriesStats } from "@/lib/scanner";
import { seriesThumbPath } from "@/lib/thumbnails";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "batchItems") {
      const seriesIds = (body.seriesIds || []) as string[];
      if (!seriesIds.length) {
        return NextResponse.json({ error: "缺少 seriesIds" }, { status: 400 });
      }
      const items = listItemsForSeriesIds(seriesIds);
      return NextResponse.json({ items });
    }

    if (body.action === "resetProgress") {
      const seriesIds = (body.seriesIds || []) as string[];
      if (!seriesIds.length) {
        return NextResponse.json({ error: "缺少 seriesIds" }, { status: 400 });
      }
      const result = resetSeriesProgress(seriesIds);
      return NextResponse.json(result);
    }

    if (body.action === "deleteSeries") {
      const seriesIds = (body.seriesIds || []) as string[];
      if (!seriesIds.length) {
        return NextResponse.json({ error: "缺少 seriesIds" }, { status: 400 });
      }
      const result = deleteSeriesMany(seriesIds);
      return NextResponse.json(result);
    }

    if (body.action === "regroup") {
      if (!Array.isArray(body.itemIds) ||
          !body.itemIds.every((id: unknown) => typeof id === "string" && id.length > 0) ||
          typeof body.sourceSeriesId !== "string") {
        return NextResponse.json({ error: "分组参数无效" }, { status: 400 });
      }
      const result = regroupItems(body.itemIds, {
        sourceSeriesId: body.sourceSeriesId,
        title: typeof body.title === "string" ? body.title : undefined,
        targetSeriesId: typeof body.targetSeriesId === "string" ? body.targetSeriesId : undefined,
      });
      for (const id of [result.targetId, body.sourceSeriesId]) {
        try { fs.unlinkSync(seriesThumbPath(id)); } catch { /* thumbnail is generated lazily */ }
      }
      const db = getDb();
      const now = Date.now();
      try {
        await refreshSeriesStats(db, result.targetId, now);
        if (!result.sourceRemoved) await refreshSeriesStats(db, body.sourceSeriesId, now);
      } catch (error) {
        console.warn("[rm] 分组成功，但封面更新失败", error);
      }
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  let body: {
    action?: string;
    id: string;
    progress: number;
    rating: number;
    seriesId: string;
    orderedIds: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求内容为空或格式错误" }, { status: 400 });
  }

  if (body.action === "progress") {
    updateItemProgress(body.id, body.progress);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "rating") {
    const item = updateItemRating(body.id, body.rating);
    return NextResponse.json({ item });
  }

  if (body.action === "reorder") {
    reorderItems(body.seriesId, body.orderedIds);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
