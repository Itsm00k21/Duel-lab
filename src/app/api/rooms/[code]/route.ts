import { NextResponse } from "next/server";
import { getSnapshot, joinRoom } from "@/lib/multiplayer/roomStore";
import type { DeckList } from "@/lib/deck/types";

export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const token = req.headers.get("x-room-token") || new URL(req.url).searchParams.get("token") || "";
    if (!token) return NextResponse.json({ error: "Missing token." }, { status: 401 });
    return NextResponse.json(getSnapshot(code, token));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const body = (await req.json()) as { name?: string; deck?: DeckList };
    if (!body.deck) return NextResponse.json({ error: "Deck required." }, { status: 400 });
    return NextResponse.json(joinRoom(code, { name: body.name || "Guest", deck: body.deck }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
