import { NextRequest, NextResponse } from "next/server";
import { getSeriesById, updateSeries, deleteSeries, setSeriesTags } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const series = getSeriesById(id);
  if (!series) {
    return NextResponse.json({ error: "未找到" }, { status: 404 });
  }
  return NextResponse.json(series);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();

  if (body.tagIds) {
    setSeriesTags(id, body.tagIds as string[]);
  }

  const rest = { ...body };
  delete rest.tagIds;
  if (Object.keys(rest).length > 0) {
    updateSeries(id, rest);
  }

  return NextResponse.json(getSeriesById(id));
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  deleteSeries(id);
  return NextResponse.json({ ok: true });
}
