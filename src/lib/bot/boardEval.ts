import type { CompactCard } from "@/lib/cards/types";
import type { GameState, PlayerId } from "@/lib/game/types";
import { analyzeCard } from "./cardIntel";
import type { BotProfile } from "./types";

export type BoardEval = {
  interactions: number;
  endBoardPieces: number;
  monsters: number;
  backrow: number;
  threat: number;
  note: string;
};

function norm(s: string) {
  return s.toLowerCase().replace(/['’]/g, "").trim();
}

export function evaluateBoard(state: GameState, who: PlayerId, byId: Map<number, CompactCard>, profile: BotProfile): BoardEval {
  const p = state.players[who];
  const mons = p.monsters.filter(Boolean);
  const sts = p.spells.filter(Boolean);
  let interactions = 0;
  let endBoardPieces = 0;
  for (const c of [...mons, ...sts, p.field].filter(Boolean)) {
    const data = byId.get(c!.cardId);
    if (!data) continue;
    const intel = analyzeCard(data, profile);
    if (c!.faceUp) interactions += intel.interaction;
    else if (sts.includes(c!)) interactions += 1; // set trap as unknown interaction
    if (profile.endBoard.some((n) => norm(n) === norm(data.name))) endBoardPieces += 2;
    else if (profile.extraBosses.some((n) => norm(n) === norm(data.name))) endBoardPieces += 1;
  }
  const monsters = mons.length;
  const backrow = sts.length + (p.field ? 1 : 0);
  const threat = interactions * 3 + endBoardPieces * 4 + monsters + backrow;
  const note =
    interactions >= 2 || endBoardPieces >= 2
      ? `Board is real (${interactions} interaction, ${endBoardPieces} end-board).`
      : monsters + backrow === 0
        ? "Empty board."
        : "Board is bodies / backrow without much disruption.";
  return { interactions, endBoardPieces, monsters, backrow, threat, note };
}

export function comboStage(state: GameState, bot: PlayerId, byId: Map<number, CompactCard>, profile: BotProfile): string {
  const evaln = evaluateBoard(state, bot, byId, profile);
  const p = state.players[bot];
  const hasEngineSpell = p.hand.some((c) => {
    const d = byId.get(c.cardId);
    return d && profile.engineSpells.some((n) => norm(n) === norm(d.name));
  });
  const hasStarterMon = p.hand.some((c) => {
    const d = byId.get(c.cardId);
    return d && profile.normalSummon.some((n) => norm(n) === norm(d.name));
  });
  if (evaln.endBoardPieces >= 2) return "protect-endboard";
  if (evaln.monsters >= 1 && evaln.interactions < 2) return "climb-extra";
  if (hasEngineSpell) return "fire-engine";
  if (hasStarterMon) return "normal-summon";
  if (evaln.monsters === 0) return "establish-body";
  return "extend-or-pass";
}
