import type { CompactCard } from "@/lib/cards/types";
import { isSpell, isTrap } from "./psct";

function raceOf(card: CompactCard) {
  return (card.race ?? "").toLowerCase();
}

function typeOf(card: CompactCard) {
  return card.type.toLowerCase();
}

/** Continuous / Field / Equip stay after activation. Everything else leaves. */
export function staysOnFieldAfterActivate(card: CompactCard): boolean {
  if (!isSpell(card) && !isTrap(card)) return true;
  const r = raceOf(card);
  const t = typeOf(card);
  if (r === "continuous" || t.includes("continuous")) return true;
  if (r === "field" || t.includes("field")) return true;
  if (r === "equip" || t.includes("equip")) return true;
  return false;
}

export function isOneShotSpellTrap(card: CompactCard): boolean {
  return (isSpell(card) || isTrap(card)) && !staysOnFieldAfterActivate(card);
}

export function isFieldSpellCard(card: CompactCard): boolean {
  return isSpell(card) && (raceOf(card) === "field" || typeOf(card).includes("field"));
}

export function isEquipSpellCard(card: CompactCard): boolean {
  return isSpell(card) && (raceOf(card) === "equip" || typeOf(card).includes("equip"));
}

export function isContinuousSpellTrap(card: CompactCard): boolean {
  return staysOnFieldAfterActivate(card) && !isFieldSpellCard(card);
}
