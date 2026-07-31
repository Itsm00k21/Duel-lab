import { NextResponse } from "next/server";
import type { FormatId } from "@/lib/deck/formats";
import { setRoomFormat } from "@/lib/multiplayer/roomStore";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const token = req.headers.get("x-room-token") || "";
    const body = (await req.json()) as { formatId?: FormatId };
    if (!body.formatId) return NextResponse.json({ error: "formatId required" }, { status: 400 });
    return NextResponse.json(setRoomFormat(code, token, body.formatId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
