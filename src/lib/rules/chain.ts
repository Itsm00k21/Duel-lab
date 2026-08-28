import type { CompactCard } from "@/lib/cards/types";
import type { PlayerId } from "@/lib/game/types";
import {
  cardActivationSpeed,
  isCounterTrap,
  isMonster,
  isQuickPlaySpell,
  isSpell,
  isTrap,
  parseCard,
  type ParsedClause,
} from "./psct";

export type SpellSpeed = 0 | 1 | 2 | 3;
export type FetBox = "A" | "yellow" | "B" | "C" | "D" | "E";

export type ChainLink = {
  id: string;
  link: number;
  player: PlayerId;
  cardId: number;
  cardName: string;
  instanceId?: string;
  spellSpeed: 1 | 2 | 3;
  kind: string;
  label: string;
  mandatory?: boolean;
  clauseIndex?: number;
  negated?: boolean;
  /** True when this link is the Spell/Trap card activation itself. */
  cardActivation?: boolean;
  /** One-shot S/T go to GY when this link resolves (Ash still sends them). */
  leavesTo?: "gy";
  /** Clause text / includes snapshot for legal response checks & debug. */
  clauseText?: string;
  includes?: string[];
  /** Effect work that runs only if this activation is not negated. */
  pendingResolve?: PendingResolve;
};

export type PendingResolve = {
  owner: PlayerId;
  instanceId?: string;
  cardId: number;
  cardActivation?: boolean;
  searches?: import("./searchEffect").SearchSpec[];
  damage?: { amount: number; to: "self" | "opponent" | "both" };
  bonusNormalSummons?: number;
  /** Cards chosen at activation (Imperm/Veiler targets, etc.). */
  targetInstanceIds?: string[];
  /** Apply EoT monster-effect negation to targets when this link resolves. */
  negateMonsterUntilEot?: boolean;
  /** Multi-step resolve ops (choice / excavate / fusion-spell / declare / draw / negate). */
  ops?: import("./effectOps").EffectOp[];
  /** Cards sent as cost (Droplet / Souls) for "that many" resolve. */
  sentCount?: number;
};

export type ChainState = {
  links: ChainLink[];
  resolved: ChainLink[];
  pendingPlayer: PlayerId | null;
  consecutivePasses: number;
  complete: boolean;
};

export const EMPTY_CHAIN: ChainState = {
  links: [],
  resolved: [],
  pendingPlayer: null,
  consecutivePasses: 0,
  complete: false,
};

export function otherPlayer(id: PlayerId): PlayerId {
  return id === "p1" ? "p2" : "p1";
}

export function canChainSpeed(
  previous: SpellSpeed | null,
  next: SpellSpeed,
  opts?: { segoc?: boolean },
): { ok: boolean; reason: string } {
  if (next === 0) {
    return { ok: false, reason: "Continuous / non-activating text does not make a Chain Link." };
  }
  if (previous == null) {
    if (next === 3) {
      return {
        ok: true,
        reason:
          "Counter Traps are Spell Speed 3 and normally respond to an activation or event. Using as CL1 only if responding to a summon/action without Spell Speed.",
      };
    }
    return { ok: true, reason: "Starts the Chain as Chain Link 1." };
  }
  if (opts?.segoc && next === 1) {
    return { ok: true, reason: "SEGOC: simultaneous Trigger Effects may stack as SS1." };
  }
  if (next === 1) {
    return {
      ok: false,
      reason: "Spell Speed 1 cannot respond. Only SEGOC lets multiple SS1 effects share a Chain.",
    };
  }
  if (next < previous) {
    return {
      ok: false,
      reason: `Need Spell Speed ≥ ${previous}. SS${next} cannot respond to SS${previous}.`,
    };
  }
  if (previous === 3 && next < 3) {
    return { ok: false, reason: "Only Spell Speed 3 (Counter Traps) can respond to a Counter Trap." };
  }
  return { ok: true, reason: `Legal response (SS${next} ≥ SS${previous}).` };
}

export function segocOrder(): Array<{ owner: "turn" | "non-turn"; bucket: "mandatory" | "optional" }> {
  return [
    { owner: "turn", bucket: "mandatory" },
    { owner: "non-turn", bucket: "mandatory" },
    { owner: "turn", bucket: "optional" },
    { owner: "non-turn", bucket: "optional" },
  ];
}

export type ActivationCandidate = {
  instanceId?: string;
  cardId: number;
  cardName: string;
  owner: PlayerId;
  zoneLabel: string;
  faceDown?: boolean;
  clause: ParsedClause | null;
  clauseIndex: number;
  spellSpeed: 1 | 2 | 3;
  kind: string;
  summary: string;
  warnings: string[];
  legal: boolean;
  legalityReason: string;
};

export function clauseSummary(clause: ParsedClause | null, card: CompactCard): string {
  if (!clause) {
    if (isSpell(card) || isTrap(card)) return `Activate ${card.type}`;
    return card.name;
  }
  const head = clause.condition || clause.cost || clause.resolution;
  return head.slice(0, 140);
}

export function candidatesForCard(
  card: CompactCard,
  ctx: {
    owner: PlayerId;
    zoneLabel: string;
    instanceId?: string;
    faceDown?: boolean;
    inHand?: boolean;
    inGY?: boolean;
    inBanish?: boolean;
    onField?: boolean;
    setThisTurn?: boolean;
    setThisTurnUnknown?: boolean;
    turnPlayer: PlayerId;
    phase: string;
    fetBox: FetBox;
    previousSpeed: SpellSpeed | null;
    segoc?: boolean;
  },
): ActivationCandidate[] {
  const clauses = parseCard(card);
  const out: ActivationCandidate[] = [];
  const warnings: string[] = [];

  const tryPush = (
    clause: ParsedClause | null,
    clauseIndex: number,
    speed: 1 | 2 | 3,
    kind: string,
    extraWarn: string[] = [],
  ) => {
    const check = canChainSpeed(ctx.previousSpeed, speed, { segoc: ctx.segoc });
    const allWarn = [...warnings, ...extraWarn];
    if (ctx.faceDown && ctx.onField && isSpell(card) && !isQuickPlaySpell(card)) {
      allWarn.push("Face-down Normal/Equip/Field/Ritual/Continuous Spells activate by flipping them (usually open game state).");
    }
    const trapSetLock = Boolean(ctx.faceDown && ctx.onField && isTrap(card) && ctx.setThisTurn);
    if (ctx.faceDown && ctx.onField && isQuickPlaySpell(card) && ctx.owner === ctx.turnPlayer) {
      allWarn.push("A Quick-Play Spell Set this turn cannot be activated until the next turn.");
    }
    if (speed === 1 && ctx.fetBox !== "A" && ctx.previousSpeed == null && !ctx.segoc) {
      allWarn.push("SS1 usually needs an open game state (FET Box A), unless it is a Trigger in the yellow box / SEGOC.");
    }
    out.push({
      instanceId: ctx.instanceId,
      cardId: card.id,
      cardName: card.name,
      owner: ctx.owner,
      zoneLabel: ctx.zoneLabel,
      faceDown: ctx.faceDown,
      clause,
      clauseIndex,
      spellSpeed: speed,
      kind,
      summary: clauseSummary(clause, card),
      warnings: allWarn,
      legal: trapSetLock ? false : check.ok,
      legalityReason: trapSetLock ? "Traps cannot be activated the turn they are Set." : check.reason,
    });
  };

  if ((isSpell(card) || isTrap(card)) && (ctx.onField || ctx.inHand && isQuickPlaySpell(card) && ctx.owner === ctx.turnPlayer)) {
    const speed = (cardActivationSpeed(card) || 1) as 1 | 2 | 3;
    tryPush(null, -1, speed, isCounterTrap(card) ? "counter-trap" : isTrap(card) ? "trap" : isQuickPlaySpell(card) ? "quick-play" : "spell");
  }

  // QP from hand only on controller's turn
  if (ctx.inHand && isQuickPlaySpell(card) && ctx.owner !== ctx.turnPlayer) {
    warnings.push("Quick-Play Spells in hand can only be activated during your turn.");
  }

  clauses.forEach((clause, index) => {
    if (clause.spellSpeed === 0) return;
    const locOk =
      (ctx.inHand && (clause.fromHand || clause.kind === "trigger" || clause.kind === "quick")) ||
      (ctx.inGY && clause.fromGY) ||
      (ctx.inBanish && clause.fromBanished) ||
      (ctx.onField && !clause.fromHand && !ctx.faceDown) ||
      (ctx.onField && ctx.faceDown && (isTrap(card) || isQuickPlaySpell(card) || isSpell(card))) ||
      (ctx.inHand && isMonster(card) && (clause.fromHand || /in your hand/i.test(clause.raw)));

    if (!locOk && !(ctx.inHand && isMonster(card) && clause.fromHand)) {
      // still show likely GY/hand hints only if location matches keywords loosely
      if (ctx.inHand && !clause.fromHand && clause.kind !== "quick" && clause.kind !== "trigger") return;
      if (ctx.inGY && !clause.fromGY) return;
      if (ctx.onField && (clause.fromGY || clause.fromBanished)) return;
      if (ctx.inBanish && !clause.fromBanished) return;
    }

    const speed = Math.max(clause.spellSpeed, 1) as 1 | 2 | 3;
    tryPush(clause, index, speed, clause.kind);
  });

  // de-dupe similar summaries
  const seen = new Set<string>();
  return out.filter((c) => {
    const key = `${c.cardId}:${c.kind}:${c.summary}:${c.zoneLabel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const FET_HELP: Record<FetBox, { title: string; body: string }> = {
  A: {
    title: "Box A — Open game state",
    body: "Turn player may Normal Summon/Set, inherent Special Summon, change battle position, activate SS1, declare an attack, or pass.",
  },
  yellow: {
    title: "Yellow box — Trigger window",
    body: "Activate Trigger / Trigger-like / Flip effects that just met their timing. Build SEGOC first, then fast effects.",
  },
  B: {
    title: "Box B — Turn player fast effects",
    body: "Turn player may activate a Spell Speed 2+ effect in response, or pass to the opponent.",
  },
  C: {
    title: "Box C — Opponent fast effects",
    body: "Non-turn player may activate a Spell Speed 2+ effect, or pass. If both pass, return to Box A.",
  },
  D: {
    title: "Box D — Building / resolving a Chain",
    body: "Respond with equal or greater Spell Speed. After both players pass, resolve from the highest Chain Link down.",
  },
  E: {
    title: "Box E — Opponent after TP pass",
    body: "Turn player passed an open game state. Opponent may activate a fast effect or agree to proceed.",
  },
};
