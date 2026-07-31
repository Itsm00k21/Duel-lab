import type { CompactCard } from "./types";

export type CardKind =
  | "monster"
  | "spell"
  | "trap"
  | "ritual"
  | "fusion"
  | "synchro"
  | "xyz"
  | "link"
  | "other";

export const KIND_TABS: Array<{ id: CardKind | "all"; label: string; short: string }> = [
  { id: "all", label: "All", short: "All" },
  { id: "monster", label: "Monsters", short: "Mon" },
  { id: "spell", label: "Spells", short: "Spell" },
  { id: "trap", label: "Traps", short: "Trap" },
  { id: "ritual", label: "Ritual", short: "Rit" },
  { id: "fusion", label: "Fusion", short: "Fus" },
  { id: "synchro", label: "Synchro", short: "Syn" },
  { id: "xyz", label: "Xyz", short: "Xyz" },
  { id: "link", label: "Link", short: "Link" },
];

export function cardKind(card: CompactCard): CardKind {
  const t = card.type.toLowerCase();
  const f = (card.frameType ?? "").toLowerCase();
  if (t.includes("fusion") || f === "fusion") return "fusion";
  if (t.includes("synchro") || f === "synchro") return "synchro";
  if (t.includes("xyz") || f === "xyz") return "xyz";
  if (t.includes("link") || f === "link") return "link";
  if ((t.includes("ritual") && t.includes("monster")) || f === "ritual") return "ritual";
  if (t.includes("spell") || f === "spell") return "spell";
  if (t.includes("trap") || f === "trap") return "trap";
  if (t.includes("monster") || f.includes("pendulum") || f === "normal" || f === "effect" || f === "token") {
    return "monster";
  }
  return "other";
}

export function kindLabel(kind: CardKind | "all") {
  return KIND_TABS.find((t) => t.id === kind)?.label ?? "Other";
}

export function isExtraKind(kind: CardKind) {
  return kind === "fusion" || kind === "synchro" || kind === "xyz" || kind === "link";
}
