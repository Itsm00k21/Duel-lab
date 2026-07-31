import type { CompactCard } from "@/lib/cards/types";
import type { GameState, PlayerId, ZoneCard, ZoneRef } from "@/lib/game/types";

export type EffectTargetKind = "opp-monster" | "opp-effect-monster" | "any-face-up-monster";

export type EffectTargetSpec = {
  kind: EffectTargetKind;
  count: number;
  faceUp: boolean;
  label: string;
};

function isEffectMonster(data?: CompactCard) {
  if (!data) return false;
  const t = data.type.toLowerCase();
  if (!t.includes("monster")) return false;
  if (/\bnormal\b/.test(t) && !/\beffect\b/.test(t)) return false;
  return true;
}

function other(id: PlayerId): PlayerId {
  return id === "p1" ? "p2" : "p1";
}

/** Targeting done at activation (not a cost). */
export function parseEffectTargets(text: string): EffectTargetSpec | null {
  const flat = (text || "").replace(/\s+/g, " ");
  if (/\btarget 1 (?:face-up )?effect monster your opponent controls\b/i.test(flat)) {
    return { kind: "opp-effect-monster", count: 1, faceUp: true, label: "Target 1 face-up Effect Monster your opponent controls" };
  }
  if (/\btarget 1 (?:face-up )?monster your opponent controls\b/i.test(flat)) {
    return { kind: "opp-monster", count: 1, faceUp: true, label: "Target 1 face-up monster your opponent controls" };
  }
  if (/\btarget 1 face-up monster on the field\b/i.test(flat)) {
    return { kind: "any-face-up-monster", count: 1, faceUp: true, label: "Target 1 face-up monster on the field" };
  }
  return null;
}

/** Imperm / Veiler style — negate the monster, not the previous chain link. */
export function isLingeringMonsterNegate(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (/negate that (effect|activation)|negate the activation/.test(t)) return false;
  return (
    /\bnegate its effects\b/.test(t) ||
    /\bnegate the effects of that (?:face-up )?monster\b/.test(t) ||
    /\bnegate that face-up monster'?s effects\b/.test(t)
  );
}

export function monsterEffectsAreNegated(card: ZoneCard | null | undefined, turn: number): boolean {
  if (!card) return false;
  return card.effectsNegatedUntilTurn != null && card.effectsNegatedUntilTurn >= turn;
}

export function effectTargetCandidates(
  state: GameState,
  owner: PlayerId,
  spec: EffectTargetSpec,
  byId: Map<number, CompactCard>,
): Array<{ card: ZoneCard; data?: CompactCard; ref: ZoneRef; label: string }> {
  const out: Array<{ card: ZoneCard; data?: CompactCard; ref: ZoneRef; label: string }> = [];
  const consider = (card: ZoneCard | null | undefined, controller: PlayerId | "shared", zone: "monster" | "emz", index: number) => {
    if (!card || (spec.faceUp && !card.faceUp)) return;
    const data = byId.get(card.cardId);
    if (spec.kind === "opp-effect-monster" && !isEffectMonster(data)) return;
    const ref: ZoneRef =
      zone === "emz"
        ? { owner: "shared", zone: "emz", index: index === 0 ? 0 : 1 }
        : { owner: controller as PlayerId, zone: "monster", index };
    out.push({ card, data, ref, label: data?.name ?? card.name ?? "Monster" });
  };

  if (spec.kind === "opp-monster" || spec.kind === "opp-effect-monster") {
    const opp = state.players[other(owner)];
    opp.monsters.forEach((c, i) => consider(c, other(owner), "monster", i));
    state.emz.forEach((c, i) => {
      if (!c) return;
      // EMZ is shared; treat as opponent-controlled if we don't own a matching main-monster link. Approximate: include if face-up.
      consider(c, "shared", "emz", i);
    });
    return out;
  }

  for (const pid of ["p1", "p2"] as PlayerId[]) {
    state.players[pid].monsters.forEach((c, i) => consider(c, pid, "monster", i));
  }
  state.emz.forEach((c, i) => consider(c, "shared", "emz", i));
  return out;
}

export function pickPreferredMonsterTarget(
  state: GameState,
  owner: PlayerId,
  spec: EffectTargetSpec,
  byId: Map<number, CompactCard>,
): ZoneCard | null {
  const cands = effectTargetCandidates(state, owner, spec, byId);
  if (!cands.length) return null;
  const topId = state.chain.links.at(-1)?.instanceId;
  if (topId) {
    const hit = cands.find((c) => c.card.instanceId === topId);
    if (hit) return hit.card;
  }
  return cands[0]!.card;
}

export function fieldMonsterByInstance(state: GameState, instanceId: string): ZoneCard | null {
  for (const slot of state.emz) {
    if (slot?.instanceId === instanceId) return slot;
  }
  for (const pid of ["p1", "p2"] as PlayerId[]) {
    for (const slot of state.players[pid].monsters) {
      if (slot?.instanceId === instanceId) return slot;
    }
  }
  return null;
}
