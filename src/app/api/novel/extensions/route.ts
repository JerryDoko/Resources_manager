import { NextRequest, NextResponse } from "next/server";
import demo from "@/lib/novel/extension-demo.json";
import { buildExampleExtensionPackage, EXTENSION_PACKAGE_LIMIT, parseExtensionPackage } from "@/lib/novel/extension-package";
import { captureNovelWorkspace } from "@/lib/novel/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const zip = req.nextUrl.searchParams.get("format") !== "json";
  const data = zip ? new Uint8Array(await buildExampleExtensionPackage()) : JSON.stringify(demo, null, 2);
  return new NextResponse(data, { headers: {
    "Content-Type": zip ? "application/zip" : "application/json",
    "Content-Disposition": `attachment; filename="${zip ? "Resources-Manager-Web-Extension-Demo-1.0.0.zip" : "Resources-Manager-Web-Extension-Demo-1.0.0.json"}"`,
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}
export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host")) throw new Error("仅允许本机应用请求");
    if (Number(req.headers.get("content-length")) > EXTENSION_PACKAGE_LIMIT + 16 * 1024) throw new Error("扩展包不能超过 256 KB");
    const profileId = req.nextUrl.searchParams.get("profileId") || "";
    const valid = captureNovelWorkspace(profileId);
    if (!req.headers.get("content-type")?.startsWith("multipart/form-data") || !req.body) throw new Error("请选择 JSON 或 ZIP 扩展包");
    const reader = req.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.length;
        if (size > EXTENSION_PACKAGE_LIMIT + 16 * 1024) { await reader.cancel(); throw new Error("扩展包不能超过 256 KB"); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const form = await new Response(new Uint8Array(Buffer.concat(chunks)), { headers: { "Content-Type": req.headers.get("content-type")! } }).formData(); valid();
    if (form.get("profileId") !== profileId) throw new Error("工作区不匹配");
    const file = form.get("file");
    if (!(file instanceof File) || file.size > EXTENSION_PACKAGE_LIMIT) throw new Error("请选择 256 KB 以内的 JSON 或 ZIP 扩展包");
    const extension = await parseExtensionPackage(Buffer.from(await file.arrayBuffer()), file.name); valid();
    return NextResponse.json(extension, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
