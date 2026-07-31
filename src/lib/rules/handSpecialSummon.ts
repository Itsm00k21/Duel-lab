import type { CompactCard } from "@/lib/cards/types";
import { isMonster } from "./psct";
import type { CostSpec } from "./activationCost";

export type HandSSSpec = {
  label: string;
  /** Empty field / opponent monster gates. */
  requireNoMonsters?: boolean;
  requireAMonster?: boolean;
  requireOppMonster?: boolean;
  cost: CostSpec | null;
};

const SEND_HF =
  /\b(?:by )?send(?:ing)? (?:1|a|an|one)(?: other)? cards? from your hand or field to the (?:gy|graveyard)/i;
const SEND_HAND =
  /\b(?:by )?send(?:ing)? (?:1|a|an|one)(?: other)? cards? from your hand to the (?:gy|graveyard)/i;
const DISCARD =
  /\b(?:by )?discard(?:ing)? (?:1|a|an|one)(?! this card)(?: other)?(?: cards?)?\b/i;
const TRIBUTE =
  /\b(?:by )?tribut(?:e|ing) (?:1|a|an|one)(?: other)? monster/i;

export function parseHandSpecialSummon(card: CompactCard): HandSSSpec | null {
  if (!isMonster(card)) return null;
  const flat = (card.desc || "").replace(/\s+/g, " ");
  const inherent =
    /special summon(?:ed)? this card \(from your hand\)/i.test(flat) ||
    /you can special summon this card from your hand/i.test(flat) ||
    /must first be special summoned \(from your hand\)/i.test(flat) ||
    /special summon it from your hand/i.test(flat);
  if (!inherent) return null;

  const requireNoMonsters = /control no monsters|while you control no monsters/i.test(flat);
  const requireOppMonster = /if your opponent controls a monster/i.test(flat);
  const requireAMonster = /if you control a monster/i.test(flat) && !/no monster/i.test(flat);

  let cost: CostSpec | null = null;
  if (SEND_HF.test(flat)) {
    cost = {
      id: "handss-send-hf",
      kind: "send",
      count: 1,
      source: "hand-or-field",
      self: false,
      otherOnly: true,
      typeHint: "any",
      label: "Send 1 other card from hand or field",
    };
  } else if (SEND_HAND.test(flat)) {
    cost = {
      id: "handss-send-hand",
      kind: "send",
      count: 1,
      source: "hand",
      self: false,
      otherOnly: true,
      typeHint: "any",
      label: "Send 1 other card from hand",
    };
  } else if (DISCARD.test(flat)) {
    cost = {
      id: "handss-discard",
      kind: "discard",
      count: 1,
      source: "hand",
      self: false,
      otherOnly: true,
      typeHint: "any",
      label: "Discard 1 other card",
    };
  } else if (TRIBUTE.test(flat)) {
    cost = {
      id: "handss-tribute",
      kind: "tribute",
      count: 1,
      source: "field",
      self: false,
      otherOnly: true,
      typeHint: "monster",
      label: "Tribute 1 other monster",
    };
  }

  if (!cost && !requireNoMonsters && !requireOppMonster && !requireAMonster) {
    // e.g. "You can Special Summon this card (from your hand)" with only OPT lock
    cost = null;
  }

  return {
    label: cost ? `Special Summon (${cost.label})` : "Special Summon from hand",
    requireNoMonsters,
    requireAMonster,
    requireOppMonster,
    cost,
  };
}

export function handSSLegal(
  spec: HandSSSpec,
  fieldMonsterCount: number,
  oppMonsterCount: number,
  canPay: boolean,
) {
  if (spec.requireNoMonsters && fieldMonsterCount > 0) return false;
  if (spec.requireAMonster && fieldMonsterCount < 1) return false;
  if (spec.requireOppMonster && oppMonsterCount < 1) return false;
  if (spec.cost && !canPay) return false;
  return true;
}
