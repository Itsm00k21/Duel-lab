import { cardKind, type CardKind } from "./kinds";
import type { CompactCard } from "./types";

export type CardQuery = {
  text?: string;
  type?: string;
  race?: string;
  attribute?: string;
  level?: string;
  frame?: string;
  archetype?: string;
  kind?: CardKind | "all";
};

export function searchCards(cards: CompactCard[], query: CardQuery, limit = 80) {
  const text = query.text?.trim().toLowerCase() ?? "";
  const type = query.type?.toLowerCase() ?? "";
  const race = query.race?.toLowerCase() ?? "";
  const attribute = query.attribute?.toLowerCase() ?? "";
  const frame = query.frame?.toLowerCase() ?? "";
  const archetype = query.archetype?.toLowerCase() ?? "";
  const level = query.level ? Number(query.level) : null;
  const kind = query.kind && query.kind !== "all" ? query.kind : null;

  const results: CompactCard[] = [];
  for (const card of cards) {
    if (kind && cardKind(card) !== kind) continue;
    if (type && !card.type.toLowerCase().includes(type)) continue;
    if (race && card.race?.toLowerCase() !== race) continue;
    if (attribute && card.attribute?.toLowerCase() !== attribute) continue;
    if (frame && !card.frameType.toLowerCase().includes(frame)) continue;
    if (archetype && !card.archetype?.toLowerCase().includes(archetype)) continue;
    if (level !== null && Number.isFinite(level) && card.level !== level) continue;
    if (text) {
      const hay = `${card.name} ${card.desc} ${card.archetype ?? ""}`.toLowerCase();
      if (!hay.includes(text)) continue;
    }
    results.push(card);
    if (results.length >= limit) break;
  }
  return results;
}

export function uniqueSorted(values: Array<string | undefined>) {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) =>
    a.localeCompare(b),
  );
}
