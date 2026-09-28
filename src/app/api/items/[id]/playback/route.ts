import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getActiveProfileId, withProfile } from "@/lib/profiles";
import { isVideoPreferences, parseItemMetadata, readVideoPreferences } from "@/lib/video-preferences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const profileId = getActiveProfileId();
  return withProfile(profileId, () => {
    const item = getDb().select().from(schema.mediaItems).where(eq(schema.mediaItems.id, id)).get();
    if (!item || item.mediaType !== "video") {
      return NextResponse.json({ error: "视频不存在" }, { status: 404 });
    }
    return NextResponse.json({ profileId, preferences: readVideoPreferences(parseItemMetadata(item.metadata)) });
  });
}

export async function PUT(req: NextRequest, { params }: Context) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (typeof body.profileId !== "string" || !body.profileId || !isVideoPreferences(body.preferences)) {
      return NextResponse.json({ error: "播放设置参数无效" }, { status: 400 });
    }
    return withProfile(body.profileId, () => {
      const db = getDb();
      const item = db.select().from(schema.mediaItems).where(eq(schema.mediaItems.id, id)).get();
      if (!item || item.mediaType !== "video") {
        return NextResponse.json({ error: "视频不存在" }, { status: 404 });
      }
      const metadata = parseItemMetadata(item.metadata);
      metadata.videoPreferences = body.preferences;
      db.update(schema.mediaItems).set({ metadata: JSON.stringify(metadata) })
        .where(eq(schema.mediaItems.id, id)).run();
      return NextResponse.json({ ok: true });
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存失败" }, { status: 400 });
  }
}
