import { decodeCardText, isExtraDeckType } from "@/lib/cards/compact";
import type { CompactCard } from "@/lib/cards/types";
import type { PremadeDeck, PremadeEntry } from "@/data/premade-decks";
import { PREMADE_DECKS } from "@/data/premade-decks";
import { FORMATS, type FormatId } from "./formats";
import type { DeckList } from "./types";

export { PREMADE_DECKS };
export type { PremadeDeck };

function norm(name: string) {
  return decodeCardText(name).toLowerCase().replace(/\s+/g, " ").trim();
}

export function buildNameIndex(cards: CompactCard[]) {
  const map = new Map<string, CompactCard>();
  for (const card of cards) {
    map.set(norm(card.name), card);
    if (card.treatedAs) map.set(norm(card.treatedAs), card);
  }
  return map;
}

function expand(
  entries: PremadeEntry[],
  index: Map<string, CompactCard>,
  copiesFor: (card: CompactCard) => number,
) {
  const ids: number[] = [];
  const missing: string[] = [];
  const used = new Map<number, number>();
  for (const entry of entries) {
    if (entry.count < 1) continue;
    const card = index.get(norm(entry.name));
    if (!card) {
      missing.push(entry.name);
      continue;
    }
    const already = used.get(card.id) ?? 0;
    const max = copiesFor(card);
    const add = Math.max(0, Math.min(entry.count, max - already));
    for (let i = 0; i < add; i += 1) ids.push(card.id);
    used.set(card.id, already + add);
  }
  return { ids, missing };
}

function pushCapped(
  dest: number[],
  id: number,
  used: Map<number, number>,
  maxCopies: number,
  cap?: number,
) {
  const have = used.get(id) ?? 0;
  if (have >= maxCopies) return false;
  if (cap !== undefined && dest.length >= cap) return false;
  dest.push(id);
  used.set(id, have + 1);
  return true;
}

export function materializePremade(
  premade: PremadeDeck,
  cards: CompactCard[],
): { deck: Omit<DeckList, "id" | "createdAt" | "updatedAt"> & { id?: string }; missing: string[] } {
  const formatId: FormatId = premade.format === "master-duel" ? "master-duel" : "advanced";
  const format = FORMATS[formatId];
  const index = buildNameIndex(cards);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const listedMain = expand(premade.main, index, format.copiesFor);
  const listedExtra = expand(premade.extra, index, format.copiesFor);
  const listedSide = expand(premade.side ?? [], index, format.copiesFor);

  const main: number[] = [];
  const extra: number[] = [];
  const usedMain = new Map<number, number>();
  const usedExtra = new Map<number, number>();

  for (const id of listedMain.ids) {
    const card = byId.get(id);
    if (card && isExtraDeckType(card.type)) {
      pushCapped(extra, id, usedExtra, format.copiesFor(card), 15);
    } else {
      pushCapped(main, id, usedMain, card ? format.copiesFor(card) : 3);
    }
  }
  for (const id of listedExtra.ids) {
    const card = byId.get(id);
    if (card && !isExtraDeckType(card.type)) {
      pushCapped(main, id, usedMain, format.copiesFor(card));
    } else {
      pushCapped(extra, id, usedExtra, card ? format.copiesFor(card) : 3, 15);
    }
  }

  const padNames = [
    "Ash Blossom & Joyous Spring",
    "Infinite Impermanence",
    "Effect Veiler",
    "Droll & Lock Bird",
    "Nibiru, the Primal Being",
    "Mulcharmy Fuwalos",
    "Ghost Belle & Haunted Mansion",
    "Called by the Grave",
  ];
  let guard = 0;
  while (main.length < 40 && guard < 50) {
    guard += 1;
    let added = false;
    for (const name of padNames) {
      if (main.length >= 40) break;
      const card = index.get(norm(name));
      if (!card || isExtraDeckType(card.type)) continue;
      const have = usedMain.get(card.id) ?? 0;
      const room = format.copiesFor(card) - have;
      if (room <= 0) continue;
      main.push(card.id);
      usedMain.set(card.id, have + 1);
      added = true;
    }
    if (!added) break;
  }

  return {
    missing: [...new Set([...listedMain.missing, ...listedExtra.missing, ...listedSide.missing])],
    deck: {
      name: `${premade.name} (${premade.format === "tcg" ? "TCG" : "MD"})`,
      formatId,
      notes: `${premade.description}\n\nSource: ${premade.source} (${premade.sourceDate}).\nPlaytest snapshot — not a 1:1 copied tournament YDK. Check local banlist/copies.`,
      main,
      extra: extra.slice(0, 15),
      side: listedSide.ids,
    },
  };
}
