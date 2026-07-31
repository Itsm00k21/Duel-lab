import { NextResponse } from "next/server";
import { loadOrFetchImage, readImageIndex } from "@/lib/cards/image-cache";

export const dynamic = "force-dynamic";

let allowedCache: { at: number; ids: Set<number> } | null = null;

async function allowedImageIds() {
  if (allowedCache && Date.now() - allowedCache.at < 60_000) return allowedCache.ids;
  const index = await readImageIndex();
  const ids = new Set(index?.allowedImageIds ?? []);
  allowedCache = { at: Date.now(), ids };
  return ids;
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params;
  if (!/^\d{1,12}$/.test(rawId)) {
    return NextResponse.json({ error: "invalid image id" }, { status: 400 });
  }
  const imageId = Number(rawId);
  const size = new URL(request.url).searchParams.get("size") === "full" ? "full" : "small";

  const allowed = await allowedImageIds();
  // If index is not built yet, allow the numeric id (first sync race) but still validate bytes.
  const gate = allowed.size > 0 ? allowed : undefined;

  try {
    const image = await loadOrFetchImage(imageId, size, gate);
    if (!image) {
      return new NextResponse(null, { status: 404 });
    }
    return new NextResponse(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Card-Image-Id": String(imageId),
      },
    });
  } catch {
    return NextResponse.json({ error: "image fetch failed" }, { status: 502 });
  }
}
