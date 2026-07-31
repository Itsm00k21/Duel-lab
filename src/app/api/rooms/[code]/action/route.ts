import { NextResponse } from "next/server";
import type { GameAction } from "@/lib/game/types";
import { applyAction } from "@/lib/multiplayer/roomStore";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const token = req.headers.get("x-room-token") || "";
    const body = (await req.json()) as { action?: GameAction };
    if (!body.action) return NextResponse.json({ error: "Missing action." }, { status: 400 });
    return NextResponse.json(applyAction(code, token, body.action));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
