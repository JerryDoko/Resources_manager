import { NextRequest, NextResponse } from "next/server";
import { listSeries, getLibraryStats } from "@/lib/library";
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
