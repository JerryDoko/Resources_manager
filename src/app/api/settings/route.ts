import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings, exportBackup, importBackup } from "@/lib/library";

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
  return NextResponse.json(updateSettings(body));
}
