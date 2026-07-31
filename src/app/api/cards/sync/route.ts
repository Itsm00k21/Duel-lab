import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { compactCard } from "@/lib/cards/compact";
import { applyCardLegalityFixes } from "@/lib/cards/legality";
import { writeImageIndex, type ImageIndexEntry } from "@/lib/cards/image-cache";
import type { CompactCard } from "@/lib/cards/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CACHE_DIR = path.join(process.cwd(), "data", "cache");
const CACHE_FILE = path.join(CACHE_DIR, "cards.compact.json");
const META_FILE = path.join(CACHE_DIR, "cards.meta.json");

const CARD_SCHEMA = 2;

type CacheMeta = {
  version: string;
  lastUpdate: string;
  fetchedAt: string;
  count: number;
  schema?: number;
  imageExact?: number;
  imageAlt?: number;
  imageFallback?: number;
};

async function remoteVersion() {
  const res = await fetch("https://db.ygoprodeck.com/api/v7/checkDBVer.php", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("version check failed");
  const data = (await res.json()) as Array<{ database_version: string; last_update: string }>;
  return data[0];
}

async function readCache(): Promise<{ cards: CompactCard[]; meta: CacheMeta } | null> {
  try {
    const [raw, metaRaw] = await Promise.all([
      readFile(CACHE_FILE, "utf8"),
      readFile(META_FILE, "utf8"),
    ]);
    return {
      cards: (JSON.parse(raw) as CompactCard[]).map(applyCardLegalityFixes),
      meta: JSON.parse(metaRaw) as CacheMeta,
    };
  } catch {
    return null;
  }
}

async function writeCache(cards: CompactCard[], meta: CacheMeta) {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cards));
  await writeFile(META_FILE, JSON.stringify(meta, null, 2));
  await writeImageCrossRef(cards, meta.fetchedAt);
}

async function writeImageCrossRef(cards: CompactCard[], builtAt: string) {
  const byCardId: Record<string, ImageIndexEntry> = {};
  const allowed = new Set<number>();
  for (const card of cards) {
    if (!card.imageId) continue;
    byCardId[String(card.id)] = {
      cardId: card.id,
      name: card.name,
      imageId: card.imageId,
      match: card.imageMatch ?? "none",
      altImageIds: card.altImageIds,
    };
    allowed.add(card.imageId);
    for (const alt of card.altImageIds ?? []) allowed.add(alt);
  }
  await writeImageIndex({
    schema: CARD_SCHEMA,
    builtAt,
    byCardId,
    allowedImageIds: [...allowed],
  });
}

function imageStats(cards: CompactCard[]) {
  let imageExact = 0;
  let imageAlt = 0;
  let imageFallback = 0;
  for (const card of cards) {
    if (card.imageMatch === "exact") imageExact += 1;
    else if (card.imageMatch === "listed-alt") imageAlt += 1;
    else if (card.imageMatch === "passcode-fallback") imageFallback += 1;
  }
  return { imageExact, imageAlt, imageFallback };
}

async function fetchAllCards(): Promise<CompactCard[]> {
  const res = await fetch("https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`cardinfo failed: ${res.status}`);
  const json = (await res.json()) as { data: Parameters<typeof compactCard>[0][] };
  const cards = json.data.map(compactCard);

  try {
    const genesysRes = await fetch(
      "https://db.ygoprodeck.com/api/v7/cardinfo.php?format=genesys&misc=yes",
      { cache: "no-store", headers: { Accept: "application/json" } },
    );
    if (genesysRes.ok) {
      const genesysJson = (await genesysRes.json()) as {
        data: Array<Parameters<typeof compactCard>[0]>;
      };
      const points = new Map<number, number>();
      for (const raw of genesysJson.data) {
        const c = compactCard(raw);
        if (c.genesys !== undefined) points.set(c.id, c.genesys);
      }
      for (const card of cards) {
        const g = points.get(card.id);
        if (g !== undefined) card.genesys = g;
      }
    }
  } catch {
    // Genesys is optional enrichment.
  }

  return cards;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  try {
    const version = await remoteVersion();
    const cache = await readCache();
    const cacheFresh =
      !force &&
      cache &&
      cache.meta.version === version.database_version &&
      cache.meta.schema === CARD_SCHEMA &&
      cache.cards.length > 0 &&
      cache.cards.every((c) => typeof c.imageId === "number");
    if (cacheFresh && cache) {
      return NextResponse.json({
        cards: cache.cards,
        meta: {
          version: cache.meta.version,
          lastUpdate: cache.meta.lastUpdate,
          syncedAt: cache.meta.fetchedAt,
          count: cache.meta.count,
          source: "server-cache",
          imageExact: cache.meta.imageExact,
          imageAlt: cache.meta.imageAlt,
          imageFallback: cache.meta.imageFallback,
        },
      });
    }

    const cards = await fetchAllCards();
    const stats = imageStats(cards);
    const meta: CacheMeta = {
      version: version.database_version,
      lastUpdate: version.last_update,
      fetchedAt: new Date().toISOString(),
      count: cards.length,
      schema: CARD_SCHEMA,
      ...stats,
    };
    await writeCache(cards, meta);

    return NextResponse.json({
      cards,
      meta: {
        version: meta.version,
        lastUpdate: meta.lastUpdate,
        syncedAt: meta.fetchedAt,
        count: meta.count,
        source: "ygoprodeck",
        ...stats,
      },
    });
  } catch (error) {
    const cache = await readCache();
    if (cache) {
      return NextResponse.json({
        cards: cache.cards,
        meta: {
          version: cache.meta.version,
          lastUpdate: cache.meta.lastUpdate,
          syncedAt: cache.meta.fetchedAt,
          count: cache.meta.count,
          source: "server-cache-fallback",
          warning: error instanceof Error ? error.message : "sync failed",
        },
      });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sync failed" },
      { status: 502 },
    );
  }
}
