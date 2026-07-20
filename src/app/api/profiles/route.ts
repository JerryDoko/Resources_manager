import { NextRequest, NextResponse } from "next/server";
import { closeDb } from "@/lib/db";
import {
  createProfile,
  deleteProfile,
  listProfiles,
  renameProfile,
  setActiveProfile,
  setDefaultProfile,
} from "@/lib/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const reg = listProfiles();
    return NextResponse.json(reg);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body as { action: string };

    if (action === "create") {
      const profile = createProfile(body.name || "");
      return NextResponse.json({ profile, registry: listProfiles() });
    }

    if (action === "rename") {
      const profile = renameProfile(body.id, body.name || "");
      return NextResponse.json({ profile, registry: listProfiles() });
    }

    if (action === "setDefault") {
      const registry = setDefaultProfile(body.id);
      return NextResponse.json({ registry });
    }

    if (action === "switch") {
      const registry = setActiveProfile(body.id);
      closeDb();
      return NextResponse.json({ registry, reload: true });
    }

    if (action === "delete") {
      const registry = deleteProfile(body.id);
      closeDb();
      return NextResponse.json({ registry, reload: true });
    }

    return NextResponse.json({ error: "未知操作" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
