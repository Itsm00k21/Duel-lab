import type { CompactCard } from "@/lib/cards/types";
import type { GameAction, GameState, PlayerId, ZoneCard } from "@/lib/game/types";
import { findCardRef, isFirstTurnStartingPlayer } from "@/lib/game/engine";

function other(id: PlayerId): PlayerId {
  return id === "p1" ? "p2" : "p1";
}

export function monsterAtk(card: ZoneCard, data?: CompactCard, turn?: number) {
  if (card.isToken) return card.tokenAtk ?? 0;
  const base = data?.atk ?? 0;
  if (turn != null && card.atkHalvedUntilTurn != null && card.atkHalvedUntilTurn >= turn) return Math.floor(base / 2);
  return base;
}

export function monsterDef(card: ZoneCard, data?: CompactCard) {
  if (card.isToken) return card.tokenDef ?? 0;
  return data?.def ?? 0;
}

export function canDeclareAttack(state: GameState, player: PlayerId, card: ZoneCard) {
  if (state.phase !== "BP") return false;
  if (state.activePlayer !== player) return false;
  if (isFirstTurnStartingPlayer(state)) return false;
  if (!card.faceUp || card.position !== "atk") return false;
  if (state.attackedThisTurn.includes(card.instanceId)) return false;
  return true;
}

export function planAttack(
  state: GameState,
  byId: Map<number, CompactCard>,
  player: PlayerId,
  attacker: ZoneCard,
  target?: ZoneCard | null,
): Extract<GameAction, { type: "ATTACK" }> | null {
  if (!canDeclareAttack(state, player, attacker)) return null;
  const aData = byId.get(attacker.cardId);
  const atkVal = monsterAtk(attacker, aData);
  const opp = other(player);

  if (!target) {
    if (state.players[opp].monsters.some(Boolean)) return null;
    return { type: "ATTACK", player, attackerId: attacker.instanceId, damage: Math.max(0, atkVal), damagePlayer: opp };
  }

  const tData = byId.get(target.cardId);
  const tRef = findCardRef(state, target.instanceId);
  if (!tRef) return null;
  const piercing = /inflict piercing|piercing battle damage/i.test(aData?.desc ?? "");
  const faceDown = !target.faceUp;
  const inDef = faceDown || target.position === "def";

  if (inDef) {
    const defVal = monsterDef(target, tData);
    if (atkVal > defVal) {
      return {
        type: "ATTACK",
        player,
        attackerId: attacker.instanceId,
        target: tRef,
        damage: piercing ? atkVal - defVal : 0,
        damagePlayer: opp,
        destroyTarget: true,
      };
    }
    if (!faceDown && atkVal < defVal) {
      return {
        type: "ATTACK",
        player,
        attackerId: attacker.instanceId,
        target: tRef,
        damage: defVal - atkVal,
        damagePlayer: player,
        destroyTarget: false,
      };
    }
    return {
      type: "ATTACK",
      player,
      attackerId: attacker.instanceId,
      target: tRef,
      damage: 0,
      destroyTarget: false,
    };
  }

  const tAtk = monsterAtk(target, tData);
  if (atkVal > tAtk) {
    return {
      type: "ATTACK",
      player,
      attackerId: attacker.instanceId,
      target: tRef,
      damage: atkVal - tAtk,
      damagePlayer: opp,
      destroyTarget: true,
    };
  }
  if (atkVal < tAtk) {
    return {
      type: "ATTACK",
      player,
      attackerId: attacker.instanceId,
      target: tRef,
      damage: tAtk - atkVal,
      damagePlayer: player,
      destroyTarget: false,
      destroyAttacker: true,
    };
  }
  return {
    type: "ATTACK",
    player,
    attackerId: attacker.instanceId,
    target: tRef,
    damage: 0,
    destroyTarget: true,
    destroyAttacker: true,
  };
}

export type EffectDamage = {
  amount: number;
  to: "opponent" | "self" | "both";
};

export function parseEffectDamage(text: string): EffectDamage | null {
  const flat = text.replace(/\s+/g, " ");
  if (/for each\b|equal to\b/i.test(flat)) return null;

  const both = flat.match(/\bboth players take (\d{2,5}) damage\b/i);
  if (both) return { amount: Number(both[1]), to: "both" };

  const opp =
    flat.match(/\binflict (\d{2,5}) damage to your opponent\b/i) ||
    flat.match(/\byour opponent takes (\d{2,5}) damage\b/i) ||
    flat.match(/\binflict (\d{2,5}) damage to the opponent\b/i);
  if (opp) return { amount: Number(opp[1]), to: "opponent" };

  const self = flat.match(/\b(?:you )?take (\d{2,5}) damage\b/i);
  if (self) {
    const around = flat.slice(Math.max(0, (self.index ?? 0) - 48), (self.index ?? 0) + 48);
    if (/opponent/i.test(around)) return null;
    return { amount: Number(self[1]), to: "self" };
  }
  return null;
}
