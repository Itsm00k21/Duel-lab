import { NextResponse } from "next/server";
import { flipCoin } from "@/lib/multiplayer/roomStore";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const token = req.headers.get("x-room-token") || "";
    return NextResponse.json(flipCoin(code, token));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
