import type { CompactCard } from "@/lib/cards/types";
import type { GameState, PlayerId, ZoneCard } from "@/lib/game/types";
import { activationOptions, type ActLoc } from "./activationWindow";
import { candidatesForCard, type ActivationCandidate } from "./chain";

function visiblePrivate(state: GameState, owner: PlayerId) {
  return state.view === "god" || state.view === owner;
}

export function scanActivations(
  state: GameState,
  byId: Map<number, CompactCard>,
  opts?: { segoc?: boolean },
): ActivationCandidate[] {
  const prev = state.chain.links.at(-1)?.spellSpeed ?? null;
  const out: ActivationCandidate[] = [];

  const consider = (
    owner: PlayerId,
    card: ZoneCard,
    zoneLabel: string,
    loc: ActLoc,
    flags: { inHand?: boolean; inGY?: boolean; inBanish?: boolean; onField?: boolean; faceDown?: boolean },
  ) => {
    if (card.isToken) return;
    const data = byId.get(card.cardId);
    if (!data) return;
    const live = activationOptions(state, data, card, loc, owner, byId);
    const mapped = candidatesForCard(data, {
      owner,
      zoneLabel,
      instanceId: card.instanceId,
      faceDown: flags.faceDown ?? !card.faceUp,
      inHand: flags.inHand,
      inGY: flags.inGY,
      inBanish: flags.inBanish,
      onField: flags.onField,
      turnPlayer: state.activePlayer,
      phase: state.phase,
      fetBox: state.fetBox,
      previousSpeed: prev,
      segoc: opts?.segoc || state.fetBox === "yellow",
    }).map((c) => {
      const match = live.find((l) => l.clauseIndex === c.clauseIndex) ?? live.find((l) => l.kind === c.kind) ?? live[0];
      const allowed = Boolean(match) && live.length > 0;
      return {
        ...c,
        legal: allowed && c.legal,
        legalityReason: !live.length
          ? match?.reason ?? c.legalityReason ?? "Not a legal activation right now."
          : allowed
            ? (match?.reason ?? c.legalityReason)
            : "activationOptions rejected this clause in the current window.",
        summary: match?.summary ?? c.summary,
      };
    });
    if (!mapped.length && live.length) {
      out.push(
        ...live.map((l) => ({
          instanceId: card.instanceId,
          cardId: data.id,
          cardName: data.name,
          owner,
          zoneLabel,
          faceDown: flags.faceDown,
          clause: null,
          clauseIndex: l.clauseIndex,
          spellSpeed: l.spellSpeed,
          kind: l.kind,
          summary: l.summary,
          warnings: [],
          legal: true,
          legalityReason: l.reason,
        })),
      );
      return;
    }
    out.push(...mapped);
  };

  for (const owner of ["p1", "p2"] as PlayerId[]) {
    const p = state.players[owner];
    const showHand = visiblePrivate(state, owner);
    if (showHand) {
      for (const card of p.hand) consider(owner, card, `${p.name} hand`, "hand", { inHand: true, faceDown: false });
    }
    for (const card of p.gy) consider(owner, { ...card, faceUp: true }, `${p.name} GY`, "gy", { inGY: true, faceDown: false });
    for (const card of p.banish) {
      if (!card.faceUp && !showHand) continue;
      consider(owner, card, `${p.name} banish`, "banish", { inBanish: true, faceDown: !card.faceUp });
    }
    p.monsters.forEach((card, i) => {
      if (!card) return;
      if (!card.faceUp && !showHand) return;
      consider(owner, card, `${p.name} M${i + 1}`, "field", { onField: true, faceDown: !card.faceUp });
    });
    p.spells.forEach((card, i) => {
      if (!card) return;
      consider(owner, card, `${p.name} S/T${i + 1}`, "st", { onField: true, faceDown: !card.faceUp });
    });
    if (p.field) consider(owner, p.field, `${p.name} Field`, "st", { onField: true, faceDown: !p.field.faceUp });
  }
  state.emz.forEach((card, i) => {
    if (!card) return;
    consider("p1", card, `EMZ ${i + 1}`, "field", { onField: true, faceDown: !card.faceUp });
  });

  return out.sort((a, b) => Number(b.legal) - Number(a.legal) || a.spellSpeed - b.spellSpeed || a.cardName.localeCompare(b.cardName));
}

/** One OK/NO row per card + zone (Live scan). Prefers a legal clause when both exist. */
export function dedupeActivationScan(rows: ActivationCandidate[]): ActivationCandidate[] {
  const byKey = new Map<string, ActivationCandidate>();
  for (const row of rows) {
    const key = `${row.instanceId ?? row.cardId}:${row.zoneLabel}`;
    const prev = byKey.get(key);
    if (!prev || (row.legal && !prev.legal)) byKey.set(key, row);
  }
  return [...byKey.values()];
}
