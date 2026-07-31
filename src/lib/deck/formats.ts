import type { CompactCard } from "@/lib/cards/types";
import { isExtraDeckType } from "@/lib/cards/compact";

export type FormatId =
  | "advanced"
  | "no-ban"
  | "goat"
  | "edison"
  | "genesys"
  | "master-duel"
  | "custom";

export type FormatDef = {
  id: FormatId;
  name: string;
  description: string;
  startingLp: number;
  masterRule: 1 | 2 | 3 | 4 | 5;
  usesExtraMonsterZones: boolean;
  cardFilter?: (card: CompactCard) => boolean;
  copiesFor: (card: CompactCard) => number;
  validateExtra?: (card: CompactCard) => string | null;
  genesysBudget?: number;
};

const EDISON_END = "2010-04-19";

function tcgLegal(card: CompactCard) {
  return Boolean(card.tcgDate) || Boolean(card.formats?.some((f) => f.toLowerCase() === "tcg"));
}

function dateLte(value: string | undefined, end: string) {
  if (!value) return false;
  return value <= end;
}

function goatCopies(card: CompactCard) {
  const status = card.banGoat?.toLowerCase();
  if (status === "banned") return 0;
  if (status === "limited") return 1;
  if (status === "semi-limited") return 2;
  return 3;
}

function tcgCopies(card: CompactCard) {
  const status = card.banTcg?.toLowerCase();
  if (status === "banned") return 0;
  if (status === "limited") return 1;
  if (status === "semi-limited") return 2;
  return 3;
}

function mdCopies(card: CompactCard) {
  const status = card.banMd?.toLowerCase();
  if (status === "banned") return 0;
  if (status === "limited") return 1;
  if (status === "semi-limited") return 2;
  return 3;
}

export const FORMATS: Record<FormatId, FormatDef> = {
  advanced: {
    id: "advanced",
    name: "TCG Advanced",
    description:
      "Current TCG card pool + YGOPRODeck TCG Forbidden/Limited (2026-05-18) — https://ygoprodeck.com/banlist/",
    startingLp: 8000,
    masterRule: 5,
    usesExtraMonsterZones: true,
    cardFilter: tcgLegal,
    copiesFor: tcgCopies,
  },
  "no-ban": {
    id: "no-ban",
    name: "No Banlist",
    description: "All cached cards, 3-of everything. Pure lab mode.",
    startingLp: 8000,
    masterRule: 5,
    usesExtraMonsterZones: true,
    copiesFor: () => 3,
  },
  goat: {
    id: "goat",
    name: "GOAT",
    description: "GOAT-format pool and GOAT banlist (April 2005 era).",
    startingLp: 8000,
    masterRule: 1,
    usesExtraMonsterZones: false,
    cardFilter: (card) =>
      Boolean(card.formats?.some((f) => f.toLowerCase().includes("goat"))) ||
      Boolean(card.banGoat) ||
      dateLte(card.tcgDate, "2005-04-01"),
    copiesFor: goatCopies,
    validateExtra: (card) =>
      isExtraDeckType(card.type) && !card.type.toLowerCase().includes("fusion")
        ? "GOAT only allows Fusion monsters in the Extra Deck."
        : null,
  },
  edison: {
    id: "edison",
    name: "Edison",
    description: "TCG cards released through April 19, 2010 (Edison format).",
    startingLp: 8000,
    masterRule: 2,
    usesExtraMonsterZones: false,
    cardFilter: (card) => dateLte(card.tcgDate, EDISON_END),
    copiesFor: tcgCopies,
    validateExtra: (card) =>
      card.type.toLowerCase().includes("xyz") || card.type.toLowerCase().includes("link")
        ? "Edison has no Xyz or Link monsters."
        : null,
  },
  "master-duel": {
    id: "master-duel",
    name: "Master Duel (sandbox)",
    description:
      "Master Duel card pool + YGOPRODeck Master Duel Forbidden/Limited (2026-07-27) — https://ygoprodeck.com/banlist/",
    startingLp: 8000,
    masterRule: 5,
    usesExtraMonsterZones: true,
    cardFilter: (card) => card.formats?.some((f) => f.toLowerCase() === "master duel") ?? Boolean(card.tcgDate),
    copiesFor: mdCopies,
  },
  genesys: {
    id: "genesys",
    name: "Genesys",
    description: "Point-budget format. Deck point total is tracked in the builder.",
    startingLp: 8000,
    masterRule: 5,
    usesExtraMonsterZones: true,
    cardFilter: (card) => card.genesys !== undefined || tcgLegal(card),
    copiesFor: () => 3,
    genesysBudget: 100,
  },
  custom: {
    id: "custom",
    name: "Custom / Sandbox",
    description: "No automatic legality. Use for jank, puzzles, and house rules.",
    startingLp: 8000,
    masterRule: 5,
    usesExtraMonsterZones: true,
    copiesFor: () => 3,
  },
};

export const FORMAT_LIST = Object.values(FORMATS);
