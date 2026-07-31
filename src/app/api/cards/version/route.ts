import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const res = await fetch("https://db.ygoprodeck.com/api/v7/checkDBVer.php", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    return NextResponse.json({ error: "Failed to check card DB version" }, { status: 502 });
  }
  const data = (await res.json()) as Array<{ database_version: string; last_update: string }>;
  return NextResponse.json(data[0] ?? null);
}
