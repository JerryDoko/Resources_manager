import { NextRequest, NextResponse } from "next/server";
import { listSeries, getLibraryStats, mergeSeries } from "@/lib/library";
import type { MediaType, SortBy, TagMatchMode } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mediaType = (sp.get("type") as MediaType) || undefined;
  const search = sp.get("q") || undefined;
  const sortBy = (sp.get("sort") as SortBy) || "updated";
  const tagIds = sp.get("tags")?.split(",").filter(Boolean);
  const tagMatch = (sp.get("tagMatch") as TagMatchMode) || "any";
  const limit = Number(sp.get("limit") || 200);
  const offset = Number(sp.get("offset") || 0);

  const result = listSeries({ mediaType, search, sortBy, tagIds, tagMatch, limit, offset });
  const stats = getLibraryStats();

  return NextResponse.json({ ...result, stats });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "mergeSeries") {
      const sourceIds = (body.sourceIds || []) as string[];
      const title = String(body.title || "").trim();
      if (!title) {
        return NextResponse.json({ error: "请填写系列名称" }, { status: 400 });
      }
      const series = mergeSeries(sourceIds, title, body.author ?? null);
      return NextResponse.json({ series });
    }
    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
