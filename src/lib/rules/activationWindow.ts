import type { CompactCard } from "@/lib/cards/types";
import type { GameState, Phase, PlayerId, ZoneCard } from "@/lib/game/types";
import { canChainSpeed, type SpellSpeed } from "./chain";
import { canPayAllCosts, parseActivationCosts } from "./activationCost";
import {
  isCounterTrap,
  isMonster,
  isQuickPlaySpell,
  isSpell,
  isTrap,
  parseCard,
  type ParsedClause,
} from "./psct";
import { effectAlreadyUsed, isCardActivationTrigger, isOptReminderClause } from "./effectOpt";
import { evaluateResponse } from "./responseGate";
import { cardActivationRequirementsOk, conditionOk } from "./activationCondition";
import { conditionMatchesEvent } from "./triggerMatch";
import { staysOnFieldAfterActivate } from "./stLifecycle";
import { monsterEffectsAreNegated } from "./effectTarget";
import { locMatchesSense, senseClause, type CardSense } from "./cardSense";

export type ActLoc = "hand" | "field" | "st" | "gy" | "banish" | "extra" | "deck";

export type ActivationOption = {
  clauseIndex: number;
  kind: string;
  spellSpeed: 1 | 2 | 3;
  menuLabel: string;
  summary: string;
  reason: string;
  /** "effect" = add to chain in place. "card" = activate/play the S/T card. */
  mode: "effect" | "card";
};

const MAIN: Phase[] = ["M1", "M2"];

function other(id: PlayerId): PlayerId {
  return id === "p1" ? "p2" : "p1";
}

function blob(clause: ParsedClause) {
  return `${clause.condition ?? ""} ${clause.cost ?? ""} ${clause.resolution} ${clause.raw}`.toLowerCase();
}

function effectLabel(clause: ParsedClause) {
  const cost = (clause.cost ?? "").replace(/^you can\s+/i, "").replace(/\s+/g, " ").trim();
  const res = (clause.resolution || clause.condition || clause.raw).replace(/\s+/g, " ").trim();
  const text = cost && res && !res.toLowerCase().includes(cost.toLowerCase().slice(0, 18)) ? `${cost}; ${res}` : res || cost;
  return text.length > 90 ? `${text.slice(0, 88)}…` : text || "Activate effect";
}

function condOf(clause: ParsedClause) {
  return (clause.condition ?? "").toLowerCase();
}

function chainOpen(state: GameState) {
  return state.chain.links.length > 0;
}

function prevSpeed(state: GameState): SpellSpeed | null {
  return state.chain.links.at(-1)?.spellSpeed ?? null;
}

function speedOk(state: GameState, speed: 1 | 2 | 3, segoc = false) {
  return canChainSpeed(prevSpeed(state), speed, { segoc: segoc || state.fetBox === "yellow" }).ok;
}

function myTurn(state: GameState, owner: PlayerId) {
  return state.activePlayer === owner;
}

function openGameState(state: GameState) {
  return !chainOpen(state) && (state.fetBox === "A" || state.fetBox === "E" || state.fetBox === "yellow");
}

/** Event-gated If/When — not a free click unless the trigger window is open. */
export function isEventGated(clause: ParsedClause, sense?: CardSense) {
  const cond = condOf(clause);
  const text = blob(clause);
  if (clause.kind === "flip") return true;
  // Chain responders use responseGate, not the yellow lastEvent window.
  if (
    /when a card or effect is activated/.test(cond) ||
    /when your opponent activates/.test(cond) ||
    /if a card or effect is activated/.test(cond) ||
    /if your opponent activates/.test(cond)
  ) {
    return false;
  }
  if (sense && !sense.eventGated) return false;
  if (sense?.eventGated) return true;
  // "During the Standby/End/Draw Phase" effects wait for that phase.
  // Do NOT treat "except during the Draw Phase" as a phase-only trigger (Droll & Lock Bird).
  const phaseCond = cond.replace(/except during the [^,.;:]+/gi, "");
  if (/^during .*(standby|end|draw) phase/.test(phaseCond.trim())) return false;
  if (clause.kind === "trigger" && /(standby|end|draw) phase/.test(phaseCond) && !/^(if|when)\b/.test(phaseCond.trim())) {
    return false;
  }
  if (clause.kind === "trigger") {
    return true;
  }
  if (/^(if|when)\b/.test(cond) && /\b(summoned|sent|destroyed|banished|flipped|drawn)\b/.test(cond)) return true;
  if (/\bif this card is\b|\bwhen this card is\b/.test(text) && clause.kind !== "quick" && /\b(summoned|sent|destroyed|banished|flipped)\b/.test(text)) {
    return true;
  }
  return false;
}

function requiresChainResponse(clause: ParsedClause) {
  const cond = condOf(clause);
  return (
    /when a card or effect is activated/.test(cond) ||
    /when your opponent activates/.test(cond) ||
    /if a card or effect is activated/.test(cond) ||
    /\bwould be activated\b/.test(cond) ||
    (/\bnegate (the|that) (activation|effect)\b/.test(blob(clause)) && /\bactivat/.test(cond))
  );
}

function locationOk(clause: ParsedClause, card: CompactCard, loc: ActLoc, faceUp: boolean, sense?: CardSense): boolean {
  if (sense && (loc === "hand" || loc === "field" || loc === "st" || loc === "gy" || loc === "banish")) {
    if (locMatchesSense(sense, loc)) {
      if ((loc === "field" || loc === "st") && !faceUp && !(isSpell(card) || isTrap(card))) return false;
      if (loc === "st" && !faceUp) return false;
      return true;
    }
    // Sense is sure this line is only elsewhere (e.g. GY) — hide it here.
    if (sense.locs.length && !locMatchesSense(sense, loc === "field" ? "field" : loc)) {
      if (!(loc === "hand" && (isSpell(card) || isTrap(card)) && sense.role === "card-activation")) return false;
    }
  }
  // Location hints come from condition/cost only — never resolution
  // ("add … to your hand" is not a hand activation).
  const text = `${clause.condition ?? ""} ${clause.cost ?? ""}`.toLowerCase();
  const fromHand =
    clause.fromHand ||
    /this card from your hand|in your hand|discard this card|send this card from your hand|activate this card from your hand|while this card is in your hand|if this card is in your hand/.test(
      text,
    );
  const fromGY =
    clause.fromGY ||
    /banish this card from your gy|this card from (your |the )?gy|if this card is in (your |the )?gy|while this card is in (your |the )?gy|activate this card from your gy/.test(
      text,
    );
  const fromBanish = clause.fromBanished || /while this card is banished|this banished card/.test(text);

  if (loc === "hand") {
    if (isSpell(card) || isTrap(card)) {
      if (isQuickPlaySpell(card)) return true;
      if (isTrap(card)) return fromHand || /activate this card from your hand/.test(text);
      // Normal/continuous/etc spells activate from hand as card activation.
      return clause.kind === "activation" || clause.kind === "unclassified" || !fromGY;
    }
    return fromHand || /in your hand/.test(text);
  }
  if (loc === "gy") return fromGY;
  if (loc === "banish") return fromBanish;
  if (loc === "extra" || loc === "deck") return false;
  if (loc === "st") {
    if (!(isSpell(card) || isTrap(card))) return false;
    // Face-down S/T: only the card activation is live (handled separately). Effects need face-up.
    if (!faceUp) return false;
    if (fromGY || fromBanish) return false;
    return true;
  }
  if (loc === "field") {
    if (!faceUp) return false;
    if (fromHand || fromGY || fromBanish) return false;
    return isMonster(card) || isSpell(card) || isTrap(card);
  }
  return false;
}

function turnPhaseOk(clause: ParsedClause, state: GameState, owner: PlayerId): { ok: boolean; reason: string } {
  const condRaw = condOf(clause);
  const cond = condRaw.replace(/except during the [^,.;:]+/gi, "");
  const text = blob(clause).replace(/except during the [^,.;:]+/gi, "");
  const mine = myTurn(state, owner);
  const phase = state.phase;

  if (/during your opponent'?s? turn/.test(cond) && mine) {
    return { ok: false, reason: "Only during the opponent's turn." };
  }
  if ((/during your turn/.test(cond) || /during your main/.test(cond)) && !/opponent/.test(cond) && !mine) {
    return { ok: false, reason: "Only during your turn." };
  }

  if (/opponent'?s? main phase/.test(cond + text)) {
    if (mine || !MAIN.includes(phase)) return { ok: false, reason: "Only during the opponent's Main Phase." };
    return { ok: true, reason: "Opponent's Main Phase." };
  }
  if (/during (the )?main phase/.test(cond) || /your main phase/.test(cond)) {
    if (!MAIN.includes(phase)) return { ok: false, reason: "Only during the Main Phase." };
    if (/your main phase/.test(cond) && !mine) return { ok: false, reason: "Only during your Main Phase." };
    return { ok: true, reason: "Main Phase." };
  }
  if (/battle phase/.test(cond) || /declares an attack|attack declaration|when an opponent.s monster declares/.test(cond)) {
    if (phase !== "BP") return { ok: false, reason: "Only during the Battle Phase / attack declaration." };
    return { ok: true, reason: "Battle Phase." };
  }
  if (/standby phase/.test(cond)) {
    if (phase !== "SP") return { ok: false, reason: "Only during the Standby Phase." };
    if (/your standby/.test(cond) && !mine) return { ok: false, reason: "Only during your Standby Phase." };
    return { ok: true, reason: "Standby Phase." };
  }
  if (/end phase/.test(cond)) {
    if (phase !== "EP") return { ok: false, reason: "Only during the End Phase." };
    if (/your end phase/.test(cond) && !mine) return { ok: false, reason: "Only during your End Phase." };
    return { ok: true, reason: "End Phase." };
  }
  if (/draw phase/.test(cond) && phase !== "DP") {
    return { ok: false, reason: "Only during the Draw Phase." };
  }
  if (/during either player'?s? turn/.test(cond)) {
    return { ok: true, reason: "Either player's turn." };
  }
  return { ok: true, reason: "No stricter turn/phase lock on this line." };
}

function boardOk(
  clause: ParsedClause,
  state: GameState,
  owner: PlayerId,
  loc: ActLoc,
  byId: Map<number, CompactCard>,
): { ok: boolean; reason: string } | null {
  return conditionOk(clause, state, owner, loc, byId);
}

function clauseSpeed(clause: ParsedClause, card: CompactCard): 1 | 2 | 3 | 0 {
  if (clause.spellSpeed === 0) return 0;
  if (isCounterTrap(card)) return 3;
  if (clause.spellSpeed === 2 || clause.spellSpeed === 3) return clause.spellSpeed;
  if (isTrap(card) || isQuickPlaySpell(card)) return isCounterTrap(card) ? 3 : 2;
  return 1;
}

export function menuLocFromWhere(
  where: "hand" | "field" | "st" | "pile" | "extra",
  pileZone?: "deck" | "extra" | "gy" | "banish" | "hand" | "side",
): ActLoc {
  if (where === "hand") return "hand";
  if (where === "field") return "field";
  if (where === "st") return "st";
  if (where === "extra") return "extra";
  if (pileZone === "gy") return "gy";
  if (pileZone === "banish") return "banish";
  if (pileZone === "deck") return "deck";
  if (pileZone === "extra") return "extra";
  return "gy";
}

export function activationOptions(
  state: GameState,
  card: CompactCard,
  zoneCard: ZoneCard,
  loc: ActLoc,
  owner: PlayerId,
  byId: Map<number, CompactCard> = new Map(),
): ActivationOption[] {
  if (zoneCard.isToken) return [];
  if (isMonster(card) && (loc === "field" || loc === "st") && monsterEffectsAreNegated(zoneCard, state.turn)) {
    return [];
  }
  const clauses = parseCard(card);
  const out: ActivationOption[] = [];
  const faceUp = zoneCard.faceUp || loc === "hand" || loc === "gy";
  const mine = myTurn(state, owner);
  const segoc = state.fetBox === "yellow";

  const push = (
    clause: ParsedClause | null,
    clauseIndex: number,
    speed: 1 | 2 | 3,
    kind: string,
    mode: "effect" | "card",
    menuLabel: string,
    summary: string,
    reason: string,
  ) => {
    if (!speedOk(state, speed, segoc && speed === 1)) return;
    // Card activation (clause null) is just flipping/playing the S/T — don't scrape later effect lines for fake costs.
    const costText = clause ? `${clause.cost ?? ""} ${clause.raw}` : "";
    const costs = parseActivationCosts(costText);
    if (costs.length && !canPayAllCosts(state, owner, costs, zoneCard.instanceId, byId)) return;
    let why = reason;
    if (chainOpen(state)) {
      const top = state.chain.links.at(-1);
      const topCard = top ? byId.get(top.cardId) : undefined;
      const gate = evaluateResponse(card, clause, top, topCard, owner);
      if (mode === "effect" && !gate.ok) return;
      if (mode === "card" && gate.gate && !gate.ok) return;
      if (gate.gate) why = gate.reason;
    }
    out.push({
      clauseIndex,
      kind,
      spellSpeed: speed,
      menuLabel: costs.length ? `${menuLabel} (${costs.map((c) => c.label).join(", ")})` : menuLabel,
      summary,
      reason: costs.length ? `${why} · Cost: ${costs.map((c) => c.label).join(", ")}` : why,
      mode,
    });
  };

  const setThisTurn = zoneCard.setTurn === state.turn;

  // Card activation for S/T (play from hand / flip set).
  if (isSpell(card) || isTrap(card)) {
    const speed = (isCounterTrap(card) ? 3 : isTrap(card) || isQuickPlaySpell(card) ? 2 : 1) as 1 | 2 | 3;
    if (loc === "hand") {
      const impermHand = isTrap(card) && /activate this card from your hand/.test(card.desc.toLowerCase());
      const board = impermHand
        ? boardOk(
            {
              raw: card.desc,
              resolution: card.desc,
              kind: "activation",
              spellSpeed: 2,
              mandatory: false,
              oncePerTurn: false,
              oncePerDuel: false,
              fromHand: true,
              fromGY: false,
              fromBanished: false,
              damageStep: "unknown",
              negatesActivation: false,
              negatesEffect: false,
              targets: false,
              whenVsIf: null,
              condition: card.desc,
            },
            state,
            owner,
            loc,
            byId,
          )
        : null;
      const qp = isQuickPlaySpell(card);
      const normalSpell = isSpell(card) && !qp;
      let ok = false;
      let reason = "";
      if (normalSpell) {
        ok = mine && MAIN.includes(state.phase) && !chainOpen(state);
        reason = ok ? "Your Main Phase, open game state." : "Normal Spells activate in your Main Phase with an empty chain.";
      } else if (qp) {
        ok = mine && speedOk(state, 2);
        reason = ok ? "Quick-Play from hand (your turn)." : "Quick-Play Spells in hand are only on your turn / legal speed.";
      } else if (isTrap(card) && impermHand) {
        ok = Boolean(board?.ok) && speedOk(state, 2);
        reason = board?.ok ? "Trap can activate from hand (empty field)." : (board?.reason ?? "Cannot activate this Trap from hand.");
      }
      if (ok) {
        const req = cardActivationRequirementsOk(card, state, owner, byId);
        if (!req.ok) {
          ok = false;
          reason = req.reason;
        }
      }
      if (ok) {
        push(null, -1, speed, isTrap(card) ? "trap" : qp ? "quick-play" : "spell", "card", "Activate card", `Activate ${card.name}`, reason);
      }
    }
    if ((loc === "st" || loc === "field") && !zoneCard.faceUp && (isSpell(card) || isTrap(card))) {
      // Normal/Continuous/Equip/Field/Ritual Spells may activate the turn they are Set.
      // Traps and Quick-Plays may not.
      const trapOk = isTrap(card) && !setThisTurn && speedOk(state, speed);
      const setQp = isQuickPlaySpell(card) && !setThisTurn && speedOk(state, 2);
      const setSpell =
        isSpell(card) &&
        !isQuickPlaySpell(card) &&
        mine &&
        MAIN.includes(state.phase) &&
        !chainOpen(state);
      if (trapOk || setQp || setSpell) {
        const condHead = card.desc.split(/[.\n]/)[0]?.toLowerCase() ?? "";
        const attackLock = /declares an attack|attack declaration/.test(condHead);
        const summonLock = /when a monster.*summon|if a monster.*summon/.test(condHead);
        if (attackLock && state.phase !== "BP") {
          /* hide until attack declaration */
        } else if (summonLock && state.fetBox !== "yellow" && !chainOpen(state)) {
          /* hide until summon window */
        } else {
          const req = cardActivationRequirementsOk(card, state, owner, byId);
          if (!req.ok) {
            /* hide — no legal target / requirement */
          } else {
          const reason = setSpell
            ? "Normal/Continuous/Equip/Field/Ritual Spells can activate the turn they are Set."
            : setThisTurn
              ? "Cannot activate a Trap/Quick-Play the turn it was Set."
              : "Set card activation is legal in this window.";
          push(null, -1, speed, isTrap(card) ? "trap" : "spell", "card", "Activate card", `Activate ${card.name}`, reason);
          }
        }
      }
    }
  }

  clauses.forEach((clause, index) => {
    const sense = senseClause(card, clause);
    const speed = (clauseSpeed(clause, card) || (sense.mainPhaseClick ? 1 : 0)) as 1 | 2 | 3 | 0;
    if (!speed) return;
    if (sense.role === "opt-lock" || sense.role === "continuous" || sense.role === "summoning") return;
    if (clause.kind === "continuous" || clause.kind === "summoning") return;
    if (isOptReminderClause(clause)) return;
    if (isCardActivationTrigger(clause) && (loc === "st" || loc === "field") && faceUp) return;
    if (clause.kind === "unclassified" && !(isSpell(card) || isTrap(card)) && !sense.mainPhaseClick) return;
    if (effectAlreadyUsed(state, owner, card, zoneCard, index, clause)) return;

    const cond = condOf(clause);
    const text = blob(clause);

    // Skip leftover OPT reminder lines / material counts.
    if (/^you can only (use|activate)/.test(cond) || /^\d+ .*monster/.test(cond.trim())) {
      if (!/\b(if|when|during|quick)\b/.test(cond)) return;
    }

    if (!locationOk(clause, card, loc, faceUp, sense)) return;

    // Event-gated triggers: yellow/SEGOC + matching last event + board/phase conjuncts.
    if (isEventGated(clause, sense)) {
      if (isCardActivationTrigger(clause)) return;
      if (state.fetBox !== "yellow" && !(segoc && speed === 1)) return;
      if (!speedOk(state, speed, true)) return;
      const tp = turnPhaseOk(clause, state, owner);
      if (!tp.ok) return;
      const board = boardOk(clause, state, owner, loc, byId);
      if (board && !board.ok) return;
      const ev = state.lastEvent;
      if (ev) {
        const isEventCard = Boolean(
          (ev.instanceId && zoneCard.instanceId === ev.instanceId) || (ev.cardId && zoneCard.cardId === ev.cardId),
        );
        if (!conditionMatchesEvent(clause, ev, { owner, isEventCard })) return;
      } else {
        // No stored event — leave If/When to Auto FX prompts, not free menus.
        return;
      }
      push(
        clause,
        index,
        speed,
        clause.kind,
        "effect",
        effectLabel(clause),
        (clause.condition || clause.raw).slice(0, 160),
        board?.reason || "Trigger window is open.",
      );
      return;
    }

    if (requiresChainResponse(clause) && !chainOpen(state) && state.fetBox !== "D") {
      return;
    }

    const tp = turnPhaseOk(clause, state, owner);
    if (!tp.ok) return;

    const board = boardOk(clause, state, owner, loc, byId);
    if (board && !board.ok) return;

    const phaseText = cond;
    const phaseLocked = /standby phase|end phase|battle phase|draw phase/.test(phaseText);
    if (phaseLocked && tp.ok && clause.kind !== "quick") {
      if (chainOpen(state) && speed < 2 && !segoc) return;
      push(
        clause,
        index,
        speed === 2 || speed === 3 ? speed : 1,
        clause.kind === "trigger" ? "trigger" : clause.kind === "activation" ? "activation" : "ignition",
        "effect",
        effectLabel(clause),
        (clause.condition || clause.cost || clause.resolution).slice(0, 160),
        tp.reason,
      );
      return;
    }

    if (
      clause.kind === "ignition" ||
      (clause.kind === "activation" && isMonster(card)) ||
      (sense.mainPhaseClick && sense.role === "ignition")
    ) {
      if (!mine || !MAIN.includes(state.phase)) return;
      if (chainOpen(state) && !segoc) return;
      if (loc === "field" && !faceUp) return;
      push(
        clause,
        index,
        1,
        "ignition",
        "effect",
        effectLabel(clause),
        (clause.condition || clause.cost || clause.resolution).slice(0, 160),
        sense.mainPhaseClick && sense.role === "ignition"
          ? `Card text: ${sense.reason}`
          : "Ignition effect — your Main Phase, open game state.",
      );
      return;
    }

    if (clause.kind === "quick" || sense.role === "quick" || (speed >= 2 && clause.kind !== "activation")) {
      if (!speedOk(state, speed)) return;
      // Face-up field quick, hand quick, GY quick, set trap already handled as card.
      if (loc === "st" && !faceUp) return;
      if (loc === "field" && !faceUp) return;
      if (isSpell(card) || isTrap(card)) {
        // Lingering/quick effect of an already-face-up S/T, not the initial card activation.
        if (loc === "hand") return;
        if (loc === "st" && !faceUp) return;
      }
      push(
        clause,
        index,
        speed,
        clause.kind === "quick" ? "quick" : clause.kind,
        "effect",
        effectLabel(clause),
        (clause.condition || clause.cost || clause.resolution).slice(0, 160),
        board?.reason || tp.reason || "Fast effect is live.",
      );
      return;
    }

    if (clause.kind === "activation" && (isSpell(card) || isTrap(card))) {
      if (/^when this card is activated/.test(text) || isCardActivationTrigger(clause)) return;
      // GY / banish activated S/T effects (WANTED, etc.)
      if (loc === "gy" || loc === "banish") {
        if (!mine || !MAIN.includes(state.phase)) return;
        if (chainOpen(state) && !segoc) return;
        push(
          clause,
          index,
          isTrap(card) || isQuickPlaySpell(card) ? 2 : 1,
          "activation",
          "effect",
          effectLabel(clause),
          (clause.condition || clause.cost || clause.resolution).slice(0, 160),
          tp.reason || "GY/banish Spell/Trap effect.",
        );
        return;
      }
      if (loc !== "st" || !faceUp) return;
      // Face-up Continuous Traps are SS2 free-chain unless text locks turn/phase.
      // One-shot traps sitting face-up on a chain are not re-activatable.
      if (isTrap(card) && !phaseLocked && staysOnFieldAfterActivate(card)) {
        if (!speedOk(state, 2)) return;
        push(
          clause,
          index,
          2,
          "activation",
          "effect",
          effectLabel(clause),
          (clause.condition || clause.cost || clause.resolution).slice(0, 160),
          board?.reason || tp.reason || "Face-up Trap effect.",
        );
        return;
      }
      if (!phaseLocked && (!mine || !MAIN.includes(state.phase))) return;
      if (chainOpen(state) && !segoc) return;
      if (!speedOk(state, 1, segoc)) return;
      push(
        clause,
        index,
        1,
        "activation",
        "effect",
        effectLabel(clause),
        (clause.condition || clause.cost || clause.resolution).slice(0, 160),
        tp.reason || "Face-up Spell/Trap effect.",
      );
    }
  });

  const seen = new Set<string>();
  return out.filter((o) => {
    const key = `${o.mode}:${o.spellSpeed}:${o.summary}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function hasVoluntaryEffect(options: ActivationOption[]) {
  return options.some((o) => o.mode === "effect");
}

export function hasCardActivation(options: ActivationOption[]) {
  return options.some((o) => o.mode === "card");
}
