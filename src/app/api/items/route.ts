import { NextRequest, NextResponse } from "next/server";
import { updateItemProgress, reorderItems } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
