import { NextResponse } from "next/server";
import { loadOrFetchImage, readImageIndex } from "@/lib/cards/image-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    ids?: number[];
    size?: "small" | "full";
    limit?: number;
  };
  const size = body.size === "full" ? "full" : "small";
  const index = await readImageIndex();
  const allowed = new Set(index?.allowedImageIds ?? []);
  const requested = (body.ids?.length ? body.ids : [...allowed]).filter((id) => Number.isInteger(id) && id > 0);
  const unique = [...new Set(requested)].filter((id) => allowed.size === 0 || allowed.has(id));
  const limit = Math.min(body.limit ?? 250, 800);
  const batch = unique.slice(0, limit);

  let ok = 0;
  let failed = 0;
  for (const id of batch) {
    const image = await loadOrFetchImage(id, size, allowed.size ? allowed : undefined);
    if (image) ok += 1;
    else failed += 1;
  }

  return NextResponse.json({
    attempted: batch.length,
    remaining: Math.max(0, unique.length - batch.length),
    ok,
    failed,
    size,
  });
}
