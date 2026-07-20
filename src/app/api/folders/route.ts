import { NextRequest, NextResponse } from "next/server";
import { addFolder, listFolders, removeFolder } from "@/lib/library";
import { scanAllFolders, scanFolder, regenerateAllThumbnails } from "@/lib/scanner";
import { chooseFolderInFinder } from "@/lib/finder";
import type { MediaType } from "@/lib/types";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ folders: listFolders() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === "browse") {
    const result = await chooseFolderInFinder(body.prompt || "选择媒体文件夹");
    return NextResponse.json(result);
  }

  if (action === "add") {
    const { path: folderPath, mediaType } = body as {
      path: string;
      mediaType: MediaType;
    };
    if (!folderPath || !mediaType) {
      return NextResponse.json({ error: "缺少 path 或 mediaType" }, { status: 400 });
    }
    if (!fs.existsSync(folderPath)) {
      return NextResponse.json({ error: "文件夹不存在" }, { status: 400 });
    }
    const folder = addFolder(folderPath, mediaType);
    const result = await scanFolder(folderPath, mediaType);
    return NextResponse.json({ folder, scan: result });
  }

  if (action === "scan") {
    const result =
      body.path && body.mediaType
        ? await scanFolder(body.path, body.mediaType)
        : await scanAllFolders();
    return NextResponse.json({ scan: result });
  }

  if (action === "thumbnails") {
    const result = await regenerateAllThumbnails();
    return NextResponse.json(result);
  }

  if (action === "remove") {
    removeFolder(body.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}
