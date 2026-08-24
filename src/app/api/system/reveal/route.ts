import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { path?: unknown };
    if (typeof body.path !== "string" || !path.isAbsolute(body.path)) {
      return NextResponse.json({ error: "文件路径无效" }, { status: 400 });
    }
    if (!fs.existsSync(body.path)) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }

    const command =
      process.platform === "darwin"
        ? { file: "open", args: ["-R", body.path] }
        : process.platform === "win32"
          ? { file: "explorer.exe", args: [`/select,${body.path}`] }
          : { file: "xdg-open", args: [path.dirname(body.path)] };
    const child = spawn(command.file, command.args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "无法打开文件夹" },
      { status: 500 }
    );
  }
}
