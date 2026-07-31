import { NextResponse } from "next/server";
import { peekRoom } from "@/lib/multiplayer/roomStore";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    return NextResponse.json(peekRoom(code));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
