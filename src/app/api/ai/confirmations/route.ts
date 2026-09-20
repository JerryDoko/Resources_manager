import { NextRequest, NextResponse } from "next/server";
import {
  listAiConfirmations,
  resolveAiConfirmation,
  verifyAiRequest,
  waitForAiConfirmation,
} from "@/lib/ai-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = verifyAiRequest(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });
  if (
    req.nextUrl.searchParams.get("wait") === "1" &&
    (listAiConfirmations() as unknown[]).length === 0
  ) {
    await waitForAiConfirmation();
  }
  return NextResponse.json({ confirmations: listAiConfirmations() });
}

export async function POST(req: NextRequest) {
  const authError = verifyAiRequest(req);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });
  try {
    const body = await req.json();
    const confirmation = await resolveAiConfirmation(
      String(body.id || ""),
      body.decision === "approve"
    );
    return NextResponse.json({ confirmation });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
