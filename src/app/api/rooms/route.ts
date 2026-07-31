import { NextResponse } from "next/server";
import type { FormatId } from "@/lib/deck/formats";
import type { DeckList } from "@/lib/deck/types";
import { createRoom } from "@/lib/multiplayer/roomStore";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; formatId?: FormatId; deck?: DeckList };
    if (!body.deck || !body.formatId) return NextResponse.json({ error: "Deck and format required." }, { status: 400 });
    const created = createRoom({ name: body.name || "Host", formatId: body.formatId, deck: body.deck });
    return NextResponse.json(created);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
