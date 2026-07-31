import type { GameState, PlayerId, ZoneRef } from "@/lib/game/types";

export type MoveCheck = { ok: boolean; reason: string };

function zoneOf(ref: ZoneRef) {
  return ref.zone;
}

/** Cards you may manually interact with (not the opponent's). */
export function controlsRef(actor: PlayerId, ref: ZoneRef): boolean {
  if (ref.owner === "shared") return true;
  return ref.owner === actor;
}

/**
 * Manual drag / menu moves — not card effects and not core mechanics.
 * Players cannot freely send cards to GY/banish, bounce, or steal.
 * (Tribute, battle, materials, activation costs, and resolving S/T are not manual moves.)
 */
export function isLegalManualMove(_state: GameState, actor: PlayerId, from: ZoneRef, to: ZoneRef): MoveCheck {
  if (!controlsRef(actor, from)) {
    return { ok: false, reason: "You can only move your own cards." };
  }
  if (to.owner !== "shared" && to.owner !== actor) {
    if (to.zone === "monster" || to.zone === "st" || to.zone === "field" || to.zone === "hand" || to.zone === "deck" || to.zone === "extra" || to.zone === "gy" || to.zone === "banish") {
      return { ok: false, reason: "You can't put cards in the opponent's zones." };
    }
  }

  if (to.zone === "hand") {
    return { ok: false, reason: "Cards only return to the hand by a card effect." };
  }
  if (to.zone === "deck") {
    return { ok: false, reason: "Cards only return to the Deck by a card effect." };
  }
  if (to.zone === "extra") {
    return { ok: false, reason: "Cards only return to the Extra Deck by a card effect." };
  }
  if (to.zone === "side") {
    return { ok: false, reason: "Can't move cards to the Side Deck during a duel." };
  }
  if (to.zone === "gy") {
    return { ok: false, reason: "Cards only go to the GY by a card effect or a game mechanic (battle, tribute, cost, materials)." };
  }
  if (to.zone === "banish") {
    return { ok: false, reason: "Cards are only banished by a card effect or cost." };
  }

  const fromZ = zoneOf(from);
  const toZ = zoneOf(to);

  if (fromZ === "gy" || fromZ === "banish" || fromZ === "deck") {
    if (toZ === "monster" || toZ === "emz" || toZ === "st" || toZ === "field") {
      return { ok: false, reason: "Summoning / activating from here only works by a card effect." };
    }
  }

  if (fromZ === "extra" && (toZ === "monster" || toZ === "emz")) {
    return { ok: false, reason: "Extra Deck summons go through Special Summon, not a free drag." };
  }

  // Same-column shuffle / no-op
  if (fromZ === toZ && from.owner === to.owner) {
    if (fromZ === "monster" || fromZ === "st" || fromZ === "emz") {
      return { ok: true, reason: "Reposition." };
    }
  }

  return { ok: false, reason: "That move isn't allowed unless a card effect does it." };
}

