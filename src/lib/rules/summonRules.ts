import type { CompactCard } from "@/lib/cards/types";
import { cardKind, isExtraKind } from "@/lib/cards/kinds";
import type { GameState, PlayerId, ZoneCard } from "@/lib/game/types";
import type { ZoneRef } from "@/lib/game/types";

/** Normal Summon/Set is once per turn unless an effect grants more. */
export function remainingNormalSummons(state: GameState, player: PlayerId): number {
  const bonus = state.bonusNormalSummons?.[player] ?? 0;
  const used = state.normalSummonUsed?.[player] ? 1 : 0;
  return Math.max(0, 1 - used + bonus);
}

export function canNormalSummonOrSet(state: GameState, player: PlayerId): boolean {
  return remainingNormalSummons(state, player) > 0;
}

/** Rulebook v10 p.48–49: Tokens on the field are treated as Normal Monsters (never Effect). */
export function isTokenNormalMonster(card: ZoneCard | null | undefined): boolean {
  return Boolean(card?.isToken);
}

export function isExtraDeckMonster(card: CompactCard): boolean {
  return isExtraKind(cardKind(card));
}

/** Tribute count for a Normal Summon (not Set of a non-tribute? Sets also tribute). */
export function tributesForNormalSummon(card: CompactCard): number {
  if (isExtraDeckMonster(card)) return -1;
  const level = card.level ?? 0;
  if (!level || level <= 4) return 0;
  if (level <= 6) return 1;
  return 2;
}

export function fieldMonsterRefs(state: GameState, owner: PlayerId): Array<{ card: ZoneCard; ref: ZoneRef }> {
  const out: Array<{ card: ZoneCard; ref: ZoneRef }> = [];
  state.players[owner].monsters.forEach((card, index) => {
    if (card && !card.isToken) out.push({ card, ref: { owner, zone: "monster", index } });
    else if (card?.isToken) out.push({ card, ref: { owner, zone: "monster", index } });
  });
  return out;
}

export function inherentSpecialSummonFromHand(card: CompactCard): boolean {
  const t = card.desc.toLowerCase();
  return (
    /special summon this card \(from your hand\)/.test(t) ||
    /special summon this card from your hand/.test(t) ||
    /you can special summon this card \(from your hand\)/.test(t)
  );
}

/** Cards like Double Summon / "in addition to your Normal Summon". */
export function bonusNormalSummonsFromText(text: string): number {
  const t = text.toLowerCase();
  if (
    /normal summon \d+ additional/.test(t) ||
    /additional normal summon/.test(t) ||
    /normal summon\/set 1 additional/.test(t) ||
    /in addition to your (?:1 )?normal summon/.test(t) ||
    /you can normal summon \d+ monster/.test(t)
  ) {
    return 1;
  }
  if (/\bdouble summon\b/.test(t)) return 1;
  return 0;
}
