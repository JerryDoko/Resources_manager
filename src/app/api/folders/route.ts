import { NextRequest, NextResponse } from "next/server";
import {
  addFolder,
  listFolders,
  removeFolder,
  updateFolderRecursive,
} from "@/lib/library";
import { scanAllFolders, scanFolder, regenerateAllThumbnails } from "@/lib/scanner";
import { chooseFolderInFinder } from "@/lib/finder";
import type { MediaType } from "@/lib/types";
import fs from "fs";
import { getActiveProfileId, withProfile } from "@/lib/profiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const activeProfileId = getActiveProfileId();
  return withProfile(activeProfileId, () =>
    NextResponse.json({ folders: listFolders(), activeProfileId })
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    const profileId =
      (typeof body.profileId === "string" && body.profileId) ||
      req.headers.get("x-resources-profile") ||
      getActiveProfileId();

    return await withProfile(profileId, async () => {
      if (action === "browse") {
        const result = await chooseFolderInFinder(body.prompt || "选择媒体文件夹");
        return NextResponse.json(result);
      }

      if (action === "add") {
        const { path: folderPath, mediaType } = body as {
          path: string;
          mediaType: MediaType;
        };
        const recursive = body.recursive !== false;
        if (!folderPath || !mediaType) {
          return NextResponse.json({ error: "缺少 path 或 mediaType" }, { status: 400 });
        }
        if (!fs.existsSync(folderPath)) {
          return NextResponse.json({ error: "文件夹不存在" }, { status: 400 });
        }
        const folder = addFolder(folderPath, mediaType, recursive);
        const result = await scanFolder(
          folderPath.replace(/\/+$/, "") || folderPath,
          mediaType,
          recursive
        );
        return NextResponse.json({ folder, scan: result, activeProfileId: profileId });
      }

      if (action === "scan") {
        const result =
          body.path && body.mediaType
            ? await scanFolder(body.path, body.mediaType, body.recursive !== false)
            : await scanAllFolders();
        return NextResponse.json({ scan: result, activeProfileId: profileId });
      }

      if (action === "thumbnails") {
        const result = await regenerateAllThumbnails();
        return NextResponse.json({ ...result, activeProfileId: profileId });
      }

      if (action === "remove") {
        removeFolder(body.id);
        return NextResponse.json({ ok: true, activeProfileId: profileId });
      }

      if (action === "set-recursive") {
        if (!body.id || typeof body.recursive !== "boolean") {
          return NextResponse.json(
            { error: "缺少 id 或 recursive" },
            { status: 400 }
          );
        }
        const folder = updateFolderRecursive(body.id, body.recursive);
        if (!folder) {
          return NextResponse.json({ error: "导入路径不存在" }, { status: 404 });
        }
        return NextResponse.json({ folder, activeProfileId: profileId });
      }

      return NextResponse.json({ error: "未知操作" }, { status: 400 });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[folders]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
