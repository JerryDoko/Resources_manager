import { NextRequest, NextResponse } from "next/server";
import {
  AI_ACTIONS,
  canUseAiLevel,
  createAiConfirmation,
  executeAiAction,
  getAiAction,
  listAiConfirmations,
  verifyAiRequest,
} from "@/lib/ai-control";
import { getSettings } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const settings = getSettings();
  const confirmationId = req.nextUrl.searchParams.get("confirmationId");
  if (confirmationId) {
    const authError = verifyAiRequest(req);
    if (authError) return NextResponse.json({ error: authError }, { status: 401 });
    return NextResponse.json({ confirmation: listAiConfirmations(confirmationId) });
  }
  return NextResponse.json({
    enabled: settings.aiEnabled,
    permissionLevel: settings.aiPermissionLevel,
    endpoint: "/api/ai",
    authentication: "Authorization: Bearer <AI 控制令牌>",
    actions: AI_ACTIONS.filter((action) =>
      canUseAiLevel(settings.aiPermissionLevel, action.level)
    ),
  });
}

export async function POST(req: NextRequest) {
  const authError = verifyAiRequest(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  try {
    const body = await req.json();
    const action = getAiAction(String(body.action || ""));
    if (!action) {
      return NextResponse.json({ error: "不支持的 AI 动作" }, { status: 400 });
    }
    const settings = getSettings();
    if (!canUseAiLevel(settings.aiPermissionLevel, action.level)) {
      return NextResponse.json(
        { error: `当前 AI 权限不足，需要 ${action.level} 级权限` },
        { status: 403 }
      );
    }
    const params =
      body.params && typeof body.params === "object" && !Array.isArray(body.params)
        ? body.params
        : {};
    if (action.level === "dangerous") {
      const confirmation = createAiConfirmation(action, params);
      return NextResponse.json(
        {
          confirmationRequired: true,
          confirmationId: confirmation.id,
          message: "已发送到 Resources Manager 等待用户确认",
        },
        { status: 202 }
      );
    }
    return NextResponse.json({ ok: true, result: await executeAiAction(action.name, params) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
