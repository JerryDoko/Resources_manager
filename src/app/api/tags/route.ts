import { NextRequest, NextResponse } from "next/server";
import {
  listTags,
  createTag,
  deleteTag,
  applyTagToMany,
} from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ tags: listTags() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === "create") {
    const tag = createTag(body.name, body.color);
    return NextResponse.json({ tag });
  }

  if (action === "delete") {
    deleteTag(body.id);
    return NextResponse.json({ ok: true });
  }

  if (action === "applyMany") {
    applyTagToMany(body.seriesIds, body.tagId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
