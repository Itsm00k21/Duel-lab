import { NextResponse } from "next/server";
import { chooseFirst } from "@/lib/multiplayer/roomStore";

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const token = req.headers.get("x-room-token") || "";
    const body = (await req.json()) as { choice?: "first" | "second" };
    if (body.choice !== "first" && body.choice !== "second") {
      return NextResponse.json({ error: "Choose first or second." }, { status: 400 });
    }
    return NextResponse.json(chooseFirst(code, token, body.choice));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
