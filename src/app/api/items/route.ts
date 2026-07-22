import { NextRequest, NextResponse } from "next/server";
import {
  updateItemProgress,
  reorderItems,
  resetSeriesProgress,
  listItemsForSeriesIds,
  deleteSeriesMany,
} from "@/lib/library";

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

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();

  if (body.action === "progress") {
    updateItemProgress(body.id, body.progress);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reorder") {
    reorderItems(body.seriesId, body.orderedIds);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
