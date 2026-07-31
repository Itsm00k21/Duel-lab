import { TCG_FORBIDDEN, TCG_LIMITED, TCG_SEMI_LIMITED } from "@/data/tcg-banlist";
import type { CompactCard } from "./types";

export { TCG_BANLIST_EFFECTIVE, TCG_BANLIST_SOURCE } from "@/data/tcg-banlist";

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[’`′]/g, "'")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const STATUS = new Map<string, "Banned" | "Limited" | "Semi-Limited">();
for (const n of TCG_FORBIDDEN) STATUS.set(norm(n), "Banned");
for (const n of TCG_LIMITED) STATUS.set(norm(n), "Limited");
for (const n of TCG_SEMI_LIMITED) STATUS.set(norm(n), "Semi-Limited");

export function officialTcgStatus(name: string): "Banned" | "Limited" | "Semi-Limited" | undefined {
  return STATUS.get(norm(name));
}

/** Replace YGOPRODeck TCG status with the official May 18, 2026 Advanced list. */
export function applyOfficialTcgBanlist<T extends CompactCard>(card: T): T {
  const status = officialTcgStatus(card.treatedAs ?? card.name) ?? officialTcgStatus(card.name);
  if (status) return { ...card, banTcg: status };
  if (!card.banTcg) return card;
  const { banTcg: _drop, ...rest } = card;
  return rest as T;
}
