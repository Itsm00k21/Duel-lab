import type { CompactCard } from "@/lib/cards/types";
import type { EffectUse, GameState, PlayerId, ZoneCard } from "@/lib/game/types";
import { parseCard, type ParsedClause } from "./psct";

export type { EffectUse };

export function optNameKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function cardOptPolicy(card: CompactCard): {
  eachEffect: boolean;
  thisEffect: boolean;
  thisCard: boolean;
  followingOnly: boolean;
  /** Shape B: "You can only use 1 of the following effects of … per turn" — shared lock. */
  oneOfFollowing: boolean;
  /** Shape C: "the following effect" + "activate 1 of these effects" — one choose-1 lock. */
  chooseOne: boolean;
} {
  const t = (card.desc ?? "").toLowerCase();
  return {
    eachEffect: /only use each effect of/.test(t) || /only use each of the following effects of/.test(t),
    followingOnly: /only use each of the following effects of/.test(t),
    oneOfFollowing: /only use 1 of the following effects of/.test(t),
    chooseOne: /only use the following effect of/.test(t) && /activate 1 of these effects/.test(t),
    thisEffect: /only use this effect of/.test(t) || /only activate this effect of/.test(t),
    thisCard: /only activate (this card|1 ["“'])/.test(t) || /only activate one ["“']/.test(t),
  };
}

export function isOptReminderClause(clause: ParsedClause) {
  const raw = clause.raw.trim().toLowerCase();
  return /^you can only (use|activate)\b/.test(raw);
}

function parseReminderIndex(card: CompactCard): number {
  return parseCard(card).findIndex((c) => isOptReminderClause(c) && /following effects/.test(c.raw.toLowerCase()));
}

/** Clauses printed after a "following effects" OPT reminder. */
function isFollowingClause(card: CompactCard, clauseIndex: number): boolean {
  const reminderAt = parseReminderIndex(card);
  return reminderAt >= 0 && clauseIndex > reminderAt;
}

function isChooseOneClause(clause: ParsedClause | null): boolean {
  return Boolean(clause && /activate 1 of these effects/i.test(clause.raw));
}

export function isCardActivationTrigger(clause: ParsedClause) {
  const cond = (clause.condition ?? "").trim().toLowerCase();
  return /^when this card is activated\b/.test(cond);
}

/** Soft OPT line like "Once per turn:" on this copy. */
export function isSoftOncePerTurn(clause: ParsedClause) {
  const cond = (clause.condition ?? "").trim().toLowerCase();
  return /^once per turn\b/.test(cond) || (clause.oncePerTurn && !isOptReminderClause(clause));
}

export function effectUseScope(
  card: CompactCard,
  clause: ParsedClause | null,
  clauseIndex: number,
): "hard" | "soft" | "none" {
  if (clause && isOptReminderClause(clause)) return "none";
  const policy = cardOptPolicy(card);
  // Shape B: one shared hard OPT on the following clauses only — not eachEffect.
  if (policy.oneOfFollowing && clauseIndex >= 0) {
    return isFollowingClause(card, clauseIndex) ? "hard" : "none";
  }
  // Shape C: one hard OPT on the choose-1 clause. Do not split ●.
  if (policy.chooseOne && isChooseOneClause(clause)) return "hard";
  if (policy.eachEffect && clauseIndex >= 0) {
    if (policy.followingOnly) {
      const reminderAt = parseReminderIndex(card);
      if (reminderAt >= 0 && clauseIndex <= reminderAt) return "none";
    }
    return "hard";
  }
  if (policy.thisEffect) return "hard";
  if (policy.thisCard && (clauseIndex < 0 || (clause && isCardActivationTrigger(clause)))) return "hard";
  if (clause && isSoftOncePerTurn(clause)) return "soft";
  if (clause?.oncePerTurn) return "soft";
  return "none";
}

export function effectAlreadyUsed(
  state: GameState,
  player: PlayerId,
  card: CompactCard,
  zoneCard: ZoneCard | undefined,
  clauseIndex: number,
  clause: ParsedClause | null,
): boolean {
  const used = state.effectsUsedThisTurn ?? [];
  const key = optNameKey(card.name);
  const scope = effectUseScope(card, clause, clauseIndex);
  if (scope === "none") return false;
  const policy = cardOptPolicy(card);

  return used.some((u) => {
    if (u.player !== player) return false;
    if (u.nameKey !== key && u.cardId !== card.id) return false;
    if (scope === "soft") {
      if (!zoneCard) return u.cardId === card.id && u.clauseIndex === clauseIndex;
      return u.instanceId === zoneCard.instanceId && u.clauseIndex === clauseIndex;
    }
    // hard
    if (policy.thisEffect || (policy.thisCard && clauseIndex < 0)) {
      return true;
    }
    // Shape B: using any following clause spends the shared OPT for the rest.
    if (policy.oneOfFollowing) return isFollowingClause(card, u.clauseIndex);
    if (policy.chooseOne) return u.clauseIndex === clauseIndex;
    if (policy.eachEffect) return u.clauseIndex === clauseIndex;
    return u.clauseIndex === clauseIndex;
  });
}

export function buildEffectUse(
  player: PlayerId,
  card: CompactCard,
  clauseIndex: number,
  instanceId: string | undefined,
  clause: ParsedClause | null,
): EffectUse | null {
  const scope = effectUseScope(card, clause, clauseIndex);
  if (scope === "none") return null;
  return {
    player,
    cardId: card.id,
    nameKey: optNameKey(card.name),
    clauseIndex,
    instanceId,
    scope,
  };
}
