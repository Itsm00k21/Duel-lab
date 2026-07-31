import { PREMADE_DECKS, type PremadeDeck } from "@/data/premade-decks";
import type { FormatId } from "@/lib/deck/formats";

export function premadesForFormat(formatId: FormatId): PremadeDeck[] {
  if (formatId === "master-duel") return PREMADE_DECKS.filter((d) => d.format === "master-duel");
  return PREMADE_DECKS.filter((d) => d.format === "tcg");
}

export function randomPremade(formatId: FormatId, exceptId?: string): PremadeDeck | null {
  const pool = premadesForFormat(formatId).filter((d) => d.id !== exceptId);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}
