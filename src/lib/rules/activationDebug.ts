import type { CompactCard } from "@/lib/cards/types";
import type { ActivationTrace, GameState, PlayerId, ZoneCard } from "@/lib/game/types";
import { activationOptions, type ActLoc } from "./activationWindow";
import { canChainSpeed } from "./chain";
import { effectAlreadyUsed } from "./effectOpt";
import { isQuickPlaySpell, isSpell, isTrap, parseCard } from "./psct";
import { evaluateResponse } from "./responseGate";

export type { ActivationTrace };

const MAX = 48;
const localRing: ActivationTrace[] = [];
const listeners = new Set<() => void>();

function uid() {
  return `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function getLocalTraces(): ActivationTrace[] {
  return localRing.slice();
}

export function subscribeTraces(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function recordTrace(partial: Omit<ActivationTrace, "id" | "at"> & { at?: string }): ActivationTrace {
  const row: ActivationTrace = {
    id: uid(),
    at: partial.at ?? new Date().toISOString(),
    allowed: partial.allowed,
    cardName: partial.cardName,
    player: partial.player,
    loc: partial.loc,
    kind: partial.kind,
    spellSpeed: partial.spellSpeed,
    clauseIndex: partial.clauseIndex,
    chainLink: partial.chainLink,
    respondingTo: partial.respondingTo,
    reason: partial.reason,
    source: partial.source,
  };
  localRing.unshift(row);
  if (localRing.length > MAX) localRing.length = MAX;
  listeners.forEach((fn) => fn());
  return row;
}

export function mergeTraces(stateTraces: ActivationTrace[] | undefined): ActivationTrace[] {
  const map = new Map<string, ActivationTrace>();
  for (const row of [...(stateTraces ?? []), ...localRing]) map.set(row.id, row);
  return [...map.values()].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, MAX);
}

/** Human-readable why this card currently has no legal activation. */
export function explainActivationDenial(
  state: GameState,
  card: CompactCard,
  zoneCard: ZoneCard,
  loc: ActLoc,
  owner: PlayerId,
  byId: Map<number, CompactCard> = new Map(),
): string[] {
  const live = activationOptions(state, card, zoneCard, loc, owner, byId);
  if (live.length) {
    return live.map(
      (o) =>
        `LEGAL ${o.mode}/${o.kind} SS${o.spellSpeed} clause ${o.clauseIndex}: ${o.reason} — ${o.summary.slice(0, 120)}`,
    );
  }

  const reasons: string[] = [];
  const mine = state.activePlayer === owner;
  const chainTop = state.chain.links.at(-1);
  const prevSpeed = chainTop?.spellSpeed ?? null;
  const setThisTurn = zoneCard.setTurn === state.turn;

  if (zoneCard.isToken) reasons.push("Tokens have no activated effects.");
  if (!mine && loc !== "hand" && !(isTrap(card) || isQuickPlaySpell(card))) {
    reasons.push("Not your turn — only fast effects (traps / QP / quick) can activate.");
  }
  if (state.chain.links.length && prevSpeed != null) {
    const ss1 = canChainSpeed(prevSpeed, 1, { segoc: state.fetBox === "yellow" });
    if (!ss1.ok) reasons.push(`Chain is open (SS${prevSpeed} ${chainTop?.cardName ?? ""}). ${ss1.reason}`);
  }
  if (loc === "st" && !zoneCard.faceUp) {
    if (isTrap(card) && setThisTurn) reasons.push("Traps cannot be activated the turn they are Set.");
    if (isQuickPlaySpell(card) && setThisTurn) reasons.push("Quick-Play Spells cannot be activated the turn they are Set.");
    if (isSpell(card) && !isQuickPlaySpell(card) && !mine) {
      reasons.push("Set Normal/Continuous/Equip/Field/Ritual Spells activate only during your turn.");
    }
    if (isSpell(card) && !isQuickPlaySpell(card) && !["M1", "M2"].includes(state.phase)) {
      reasons.push("Set non-Quick-Play Spells activate in the Main Phase.");
    }
  }
  if (loc === "hand" && isSpell(card) && !isQuickPlaySpell(card)) {
    if (!mine) reasons.push("Normal Spells in hand are only on your turn.");
    if (!["M1", "M2"].includes(state.phase)) reasons.push("Normal Spells in hand need a Main Phase.");
    if (state.chain.links.length) reasons.push("Normal Spells cannot start or join an existing chain as SS1 once a chain is open (they must be CL1 in an open game state).");
  }
  if (loc === "hand" && isQuickPlaySpell(card) && !mine) {
    reasons.push("Quick-Play Spells can only be activated from the hand during your turn (Set them to use on the opponent's turn).");
  }
  if (loc === "hand" && isTrap(card) && !/activate this card from your hand/i.test(card.desc)) {
    reasons.push("Traps activate from the field after being Set (unless the text allows hand activation).");
  }

  if (chainTop) {
    const topCard = byId.get(chainTop.cardId);
    const gate = evaluateResponse(card, parseCard(card)[0] ?? null, chainTop, topCard, owner);
    if (gate.gate && !gate.ok) reasons.push(gate.reason);
  }

  const clauses = parseCard(card);
  for (const [i, clause] of clauses.entries()) {
    if (effectAlreadyUsed(state, owner, card, zoneCard, i, clause)) {
      reasons.push(`Once-per-turn lock: clause ${i} of "${card.name}" is already marked used this turn.`);
    }
  }

  if (!reasons.length) {
    reasons.push(
      `No legal activation in ${loc} (phase ${state.phase}, FET ${state.fetBox}, chain ${state.chain.links.length}, turn ${mine ? "yours" : "opponent"}).`,
    );
  }
  return reasons;
}

export function traceLine(row: ActivationTrace): string {
  const flag = row.allowed ? "ALLOW" : "BLOCK";
  const where = row.loc ? ` @${row.loc}` : "";
  const cl = row.chainLink != null ? ` CL${row.chainLink}` : "";
  const resp = row.respondingTo ? ` → ${row.respondingTo}` : "";
  return `${flag} ${row.cardName}${where}${cl}${resp} · ${row.reason}`;
}
