import type { CompactCard } from "@/lib/cards/types";
import { isCardActivationTrigger, isOptReminderClause } from "./effectOpt";
import { parseCard } from "./psct";

/** Atomic “what this effect would do” flags used for legal response checks. */
export type EffectInclude =
  | "add-deck-hand"
  | "ss-deck"
  | "send-deck-gy"
  | "add-gy-hand"
  | "add-gy-deck"
  | "add-gy-extra"
  | "ss-gy"
  | "banish-gy"
  | "ss-hand"
  | "ss-banish"
  | "ss-extra"
  | "draw"
  | "negate-effect"
  | "negate-activation"
  | "destroy"
  | "target";

export type EffectProfile = {
  text: string;
  includes: EffectInclude[];
};

const ALL_INCLUDES: EffectInclude[] = [
  "add-deck-hand",
  "ss-deck",
  "send-deck-gy",
  "add-gy-hand",
  "add-gy-deck",
  "add-gy-extra",
  "ss-gy",
  "banish-gy",
  "ss-hand",
  "ss-banish",
  "ss-extra",
  "draw",
  "negate-effect",
  "negate-activation",
  "destroy",
  "target",
];

export function textForActivation(card: CompactCard, clauseIndex?: number): string {
  const clauses = parseCard(card);
  if (clauseIndex != null && clauseIndex >= 0 && clauses[clauseIndex]) {
    const c = clauses[clauseIndex];
    return `${c.condition ?? ""} ${c.cost ?? ""} ${c.resolution}`.replace(/\s+/g, " ").trim();
  }
  const act = clauses.find((c) => isCardActivationTrigger(c));
  if (act) return `${act.condition ?? ""} ${act.cost ?? ""} ${act.resolution}`.replace(/\s+/g, " ").trim();
  return clauses
    .filter((c) => c.kind !== "continuous" && c.kind !== "summoning" && !isOptReminderClause(c))
    .map((c) => `${c.condition ?? ""} ${c.cost ?? ""} ${c.resolution}`)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim() || (card.desc ?? "");
}

export function parseIncludesFromText(raw: string): EffectInclude[] {
  const text = (raw || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const lower = text.toLowerCase();
  const out = new Set<EffectInclude>();

  if (
    /add(?:s|ing)? (?:a |1 |one |that |the |up to \d+ )?(?:card|monster|spell|trap).{0,80}from (?:your |their |the |either )?(?:main )?deck.{0,40}(?:to (?:your |their )?hand|to the hand)/i.test(
      text,
    ) ||
    /add(?:s|ing)? .{0,60}from (?:your |the )?deck to (?:your )?hand/i.test(text)
  ) {
    out.add("add-deck-hand");
  }
  if (/special summon.{0,100}from (?:your |their |the |a |an )?(?:main )?deck/i.test(text)) out.add("ss-deck");
  if (
    /send(?:s|ing)? .{0,80}from (?:your |their |the )?(?:main )?deck to (?:the )?(?:gy|graveyard)/i.test(text) ||
    /mill/i.test(lower)
  ) {
    out.add("send-deck-gy");
  }

  if (
    /add(?:s|ing)? .{0,80}from (?:your |their |the |either |a )?(?:gy|graveyard).{0,40}(?:to (?:your |their )?hand|to the hand)/i.test(
      text,
    ) ||
    /return(?:s|ing)? .{0,80}from (?:your |the |a )?(?:gy|graveyard) to (?:your )?hand/i.test(text)
  ) {
    out.add("add-gy-hand");
  }
  if (
    /(?:add|shuffle|return).{0,80}from (?:your |their |the |either |a )?(?:gy|graveyard).{0,50}(?:into|to) (?:your |the |their )?(?:main )?deck/i.test(
      text,
    )
  ) {
    out.add("add-gy-deck");
  }
  if (
    /(?:add|shuffle|return|place).{0,80}from (?:your |their |the |a )?(?:gy|graveyard).{0,50}(?:into|to) (?:your |the )?extra deck/i.test(
      text,
    )
  ) {
    out.add("add-gy-extra");
  }
  if (
    /special summon.{0,120}from (?:your |their |the |either |a )?(?:gy|graveyard)/i.test(text) ||
    (/in .{0,28}(?:gy|graveyard)/i.test(text) && /special summon/i.test(text))
  ) {
    out.add("ss-gy");
  }
  if (
    /banish(?:es|ed|ing)? .{0,120}from (?:your |their |the |either |a )?(?:gy|graveyard)/i.test(text) ||
    (/in .{0,28}(?:gy|graveyard)/i.test(text) && /\bbanish/i.test(text))
  ) {
    out.add("banish-gy");
  }

  if (/special summon.{0,80}from (?:your |their )?hand/i.test(text)) out.add("ss-hand");
  if (/special summon.{0,80}from .{0,20}banish/i.test(text)) out.add("ss-banish");
  if (/special summon.{0,80}from (?:your |the )?extra deck/i.test(text)) out.add("ss-extra");

  if (/\bdraw(?:s|ing)? \d|\bdraw a card|\bdraw cards\b/i.test(text)) out.add("draw");
  if (/negate the activation/i.test(text)) out.add("negate-activation");
  else if (/negate (that|its|the|those|their) effects?|negates? its effects?/i.test(text)) out.add("negate-effect");
  if (/\bdestroy(?:s|ed|ing)?\b/i.test(text)) out.add("destroy");
  if (/\btarget/i.test(text)) out.add("target");

  return ALL_INCLUDES.filter((k) => out.has(k));
}

export function profileEffectText(text: string): EffectProfile {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  return { text: normalized, includes: parseIncludesFromText(normalized) };
}

export function profileCardActivation(card: CompactCard, clauseIndex?: number): EffectProfile {
  return profileEffectText(textForActivation(card, clauseIndex));
}

export function hasInclude(profile: EffectProfile, key: EffectInclude) {
  return profile.includes.includes(key);
}
