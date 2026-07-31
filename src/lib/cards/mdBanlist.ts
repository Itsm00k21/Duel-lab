import { MD_FORBIDDEN, MD_LIMITED, MD_SEMI_LIMITED } from "@/data/md-banlist";
import type { CompactCard } from "./types";

export { MD_BANLIST_EFFECTIVE, MD_BANLIST_SOURCE } from "@/data/md-banlist";

function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[’`′]/g, "'")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

const STATUS = new Map<string, "Banned" | "Limited" | "Semi-Limited">();
for (const n of MD_FORBIDDEN) STATUS.set(norm(n), "Banned");
for (const n of MD_LIMITED) STATUS.set(norm(n), "Limited");
for (const n of MD_SEMI_LIMITED) STATUS.set(norm(n), "Semi-Limited");

export function officialMdStatus(name: string): "Banned" | "Limited" | "Semi-Limited" | undefined {
  return STATUS.get(norm(name));
}

export function applyOfficialMdBanlist<T extends CompactCard>(card: T): T {
  const status = officialMdStatus(card.treatedAs ?? card.name) ?? officialMdStatus(card.name);
  if (status) return { ...card, banMd: status };
  if (!card.banMd) return card;
  const { banMd: _drop, ...rest } = card;
  return rest as T;
}
