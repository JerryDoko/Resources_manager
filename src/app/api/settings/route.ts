import { NextRequest, NextResponse } from "next/server";
import {
  getSettings,
  updateSettings,
  updateItemSortPreference,
  exportBackup,
  importBackup,
} from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("backup") === "1") {
    return NextResponse.json(exportBackup());
  }
  return NextResponse.json(getSettings());
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (body.restore) {
    importBackup(body.restore);
    return NextResponse.json({ ok: true });
  }
  if (body.itemSortPreference) {
    const { seriesId, locked, key, direction } = body.itemSortPreference;
    if (
      typeof seriesId !== "string" ||
      typeof locked !== "boolean" ||
      !["name", "created", "updated"].includes(key) ||
      !["asc", "desc"].includes(direction)
    ) {
      return NextResponse.json({ error: "文件夹排序设置无效" }, { status: 400 });
    }
    return NextResponse.json(
      updateItemSortPreference(seriesId, locked ? { key, direction } : null)
    );
  }
  if (
    body.aiPermissionLevel !== undefined &&
    !["read", "reversible", "dangerous"].includes(body.aiPermissionLevel)
  ) {
    return NextResponse.json({ error: "AI 权限等级无效" }, { status: 400 });
  }
  if (body.aiApiBaseUrl !== undefined) {
    try {
      const url = new URL(String(body.aiApiBaseUrl));
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    } catch {
      return NextResponse.json({ error: "AI 服务地址无效" }, { status: 400 });
    }
  }
  if (
    body.aiControlToken !== undefined &&
    body.aiControlToken !== "" &&
    !/^[a-f0-9]{32,128}$/i.test(String(body.aiControlToken))
  ) {
    return NextResponse.json({ error: "AI 控制令牌格式无效" }, { status: 400 });
  }
  return NextResponse.json(updateSettings(body));
}
