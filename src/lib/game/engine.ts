import { nanoid } from "nanoid";
import { FORMATS } from "@/lib/deck/formats";
import type { DeckList } from "@/lib/deck/types";
import { EMPTY_CHAIN, otherPlayer } from "@/lib/rules/chain";
import { canNormalSummonOrSet } from "@/lib/rules/summonRules";
import { optNameKey } from "@/lib/rules/effectOpt";
import { isLegalManualMove } from "@/lib/rules/moveLegality";
import { recordTrace, traceLine, type ActivationTrace } from "@/lib/rules/activationDebug";
import type {
  CardPosition,
  GameAction,
  GameState,
  LogEntry,
  Phase,
  PileZone,
  PlayerId,
  PlayerState,
  StartDuelInput,
  ZoneCard,
  ZoneRef,
} from "./types";

const PHASES: Phase[] = ["DP", "SP", "M1", "BP", "M2", "EP"];

/** Rulebook v10 p.38: the player who goes first cannot conduct a Battle Phase on turn 1. */
export function isFirstTurnStartingPlayer(state: GameState): boolean {
  return state.turn === 1 && state.activePlayer === state.startingPlayer;
}

const NO_T1_BATTLE = "The player who goes first cannot conduct a Battle Phase on their first turn.";

function shuffleInPlace<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function toZoneCards(ids: number[], faceUp = false): ZoneCard[] {
  return ids.map((cardId) => ({
    instanceId: nanoid(10),
    cardId,
    faceUp,
    position: "atk" as const,
    counters: 0,
    overlay: [],
  }));
}

function emptyPlayer(id: PlayerId, name: string, lp: number, deck: DeckList): PlayerState {
  return {
    id,
    name,
    lp,
    deck: shuffleInPlace(toZoneCards(deck.main)),
    hand: [],
    gy: [],
    banish: [],
    extra: toZoneCards(deck.extra, true),
    side: toZoneCards(deck.side, true),
    monsters: [null, null, null, null, null],
    spells: [null, null, null, null, null],
    field: null,
  };
}

function log(state: GameState, text: string): LogEntry {
  return { id: nanoid(8), at: new Date().toISOString(), text };
}

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function createGame(input: StartDuelInput): GameState {
  const format = FORMATS[input.formatId];
  const lp = input.startingLp ?? format.startingLp;
  const now = new Date().toISOString();
  let state: GameState = {
    id: nanoid(),
    formatId: input.formatId,
    turn: 1,
    phase: "M1",
    activePlayer: input.startingPlayer ?? "p1",
    players: {
      p1: emptyPlayer("p1", input.p1.name, lp, input.p1.deck),
      p2: emptyPlayer("p2", input.p2.name, lp, input.p2.deck),
    },
    emz: [null, null],
    log: [],
    notes: "",
    view: input.pve ? (input.pve.bot === "p1" ? "p2" : "p1") : input.pvp ? "p1" : "god",
    rotateOpponent: false,
    chain: structuredClone(EMPTY_CHAIN),
    fetBox: "A",
    summonsThisTurn: { p1: 0, p2: 0 },
    normalSummonUsed: { p1: false, p2: false },
    bonusNormalSummons: { p1: 0, p2: 0 },
    effectsUsedThisTurn: [],
    activatedSpellThisTurn: false,
    startingPlayer: input.startingPlayer ?? "p1",
    drewThisTurn: { p1: true, p2: true },
    attackedThisTurn: [],
    debugTrace: [],
    pve: input.pve,
    pvp: input.pvp,
    createdAt: now,
    updatedAt: now,
  };
  const draw = input.startingHand ?? 5;
  state = reduce(state, { type: "DRAW", player: "p1", count: draw });
  state = reduce(state, { type: "DRAW", player: "p2", count: draw });
  state.log = [
    log(
      state,
      `${input.pvp ? "Online" : input.pve ? "Bot" : "Local"} duel started · ${format.name} · ${lp} LP · ${state.players[state.activePlayer].name} goes first.`,
    ),
    ...state.log,
  ];
  return state;
}

function pileOf(player: PlayerState, zone: PileZone): ZoneCard[] {
  return player[zone];
}

export function peekCard(state: GameState, ref: ZoneRef): ZoneCard | null {
  return getCard(state, ref);
}

function getCard(state: GameState, ref: ZoneRef): ZoneCard | null {
  if (ref.owner === "shared") return state.emz[ref.index];
  const player = state.players[ref.owner];
  if (ref.zone === "field") return player.field;
  if (ref.zone === "monster") return player.monsters[ref.index] ?? null;
  if (ref.zone === "st") return player.spells[ref.index] ?? null;
  const pile = pileOf(player, ref.zone);
  if (ref.index === undefined) return pile[0] ?? null;
  return pile[ref.index] ?? null;
}

function takeCard(state: GameState, ref: ZoneRef): ZoneCard | null {
  if (ref.owner === "shared") {
    const card = state.emz[ref.index];
    state.emz[ref.index] = null;
    return card;
  }
  const player = state.players[ref.owner];
  if (ref.zone === "field") {
    const card = player.field;
    player.field = null;
    return card;
  }
  if (ref.zone === "monster") {
    const card = player.monsters[ref.index] ?? null;
    player.monsters[ref.index] = null;
    return card;
  }
  if (ref.zone === "st") {
    const card = player.spells[ref.index] ?? null;
    player.spells[ref.index] = null;
    return card;
  }
  const pile = pileOf(player, ref.zone);
  if (!pile.length) return null;
  if (ref.index === undefined) return pile.shift() ?? null;
  const [card] = pile.splice(ref.index, 1);
  return card ?? null;
}

function firstEmpty(slots: Array<ZoneCard | null>) {
  return slots.findIndex((s) => s === null);
}

/** Tokens never occupy piles. Returns false if the card vanished instead of being placed. */
function sendToPile(state: GameState, owner: PlayerId, zone: PileZone, card: ZoneCard): boolean {
  if (card.isToken) return false;
  pileOf(state.players[owner], zone).unshift(card);
  return true;
}

function placeCard(state: GameState, ref: ZoneRef, card: ZoneCard) {
  if (ref.owner === "shared") {
    const existing = state.emz[ref.index];
    if (existing) sendToPile(state, "p1", "gy", existing);
    state.emz[ref.index] = card;
    return;
  }
  const player = state.players[ref.owner];
  if (ref.zone === "field") {
    if (player.field) sendToPile(state, ref.owner, "gy", player.field);
    player.field = card;
    return;
  }
  if (ref.zone === "monster") {
    const i = ref.index >= 0 ? ref.index : firstEmpty(player.monsters);
    if (i < 0) {
      sendToPile(state, ref.owner, "hand", card);
      return;
    }
    if (player.monsters[i]) sendToPile(state, ref.owner, "gy", player.monsters[i]!);
    player.monsters[i] = card;
    return;
  }
  if (ref.zone === "st") {
    const i = ref.index >= 0 ? ref.index : firstEmpty(player.spells);
    if (i < 0) {
      sendToPile(state, ref.owner, "hand", card);
      return;
    }
    if (player.spells[i]) sendToPile(state, ref.owner, "gy", player.spells[i]!);
    player.spells[i] = card;
    return;
  }
  if (card.isToken) return;
  const pile = pileOf(player, ref.zone);
  if (ref.index === undefined || ref.index <= 0) pile.unshift(card);
  else if (ref.index >= pile.length) pile.push(card);
  else pile.splice(ref.index, 0, card);
}

function labelRef(state: GameState, ref: ZoneRef) {
  if (ref.owner === "shared") return `EMZ ${ref.index + 1}`;
  const name = state.players[ref.owner].name;
  if (ref.zone === "monster") return `${name} Monster ${ref.index + 1}`;
  if (ref.zone === "st") return `${name} S/T ${ref.index + 1}`;
  if (ref.zone === "field") return `${name} Field`;
  return `${name} ${ref.zone}`;
}

function cardLabel(card: ZoneCard, known: boolean) {
  if (card.isToken) return card.name || "Token";
  if (!known && !card.faceUp) return "Facedown card";
  return card.name || `#${card.cardId}`;
}

function sendActivatedToGy(state: GameState, instanceId?: string, force = false): GameState {
  if (!instanceId) return state;
  const ref = findCardRef(state, instanceId);
  if (!ref || ref.owner === "shared") return state;
  if (ref.zone !== "st" && ref.zone !== "field") return state;
  const card = getCard(state, ref);
  if (!card) return state;
  if (!force && !card.leaveOnResolve) return state;
  const owner = ref.owner;
  state = reduce(state, {
    type: "MOVE",
    from: ref,
    to: { owner, zone: "gy" },
    faceUp: true,
  });
  state.log.unshift(log(state, `${state.players[owner].name}: ${card.name ?? "Card"} sent to GY after activation.`));
  return state;
}

function resolveChainTop(state: GameState): GameState {
  const top = state.chain.links.pop();
  if (!top) return state;
  state.chain.resolved.unshift(top);
  if (!top.negated && top.pendingResolve?.negateMonsterUntilEot) {
    for (const id of top.pendingResolve.targetInstanceIds ?? []) {
      let mon: ZoneCard | null = null;
      for (const slot of state.emz) {
        if (slot?.instanceId === id) mon = slot;
      }
      for (const pid of ["p1", "p2"] as PlayerId[]) {
        for (const slot of state.players[pid].monsters) {
          if (slot?.instanceId === id) mon = slot;
        }
      }
      if (!mon?.faceUp) continue;
      mon.effectsNegatedUntilTurn = state.turn;
      state.log.unshift(log(state, `${mon.name ?? top.cardName}: effects negated until the End Phase.`));
    }
  }
  state.log.unshift(
    log(state, `Resolve CL${top.link}: ${top.cardName}${top.negated ? " (negated — skip)" : ""}.`),
  );
  state = sendActivatedToGy(state, top.instanceId, top.leavesTo === "gy");
  if (!state.chain.links.length) {
    state.chain.complete = false;
    state.chain.pendingPlayer = null;
    state.chain.consecutivePasses = 0;
    state.fetBox = "yellow";
    state.log.unshift(log(state, "Chain finished. Check triggers (yellow box), then fast effects."));
  }
  return state;
}

export function normalizeGame(state: GameState): GameState {
  return {
    ...state,
    chain: state.chain ?? structuredClone(EMPTY_CHAIN),
    fetBox: state.fetBox ?? "A",
    rotateOpponent: state.rotateOpponent ?? false,
    summonsThisTurn: state.summonsThisTurn ?? { p1: 0, p2: 0 },
    normalSummonUsed: state.normalSummonUsed ?? { p1: false, p2: false },
    bonusNormalSummons: state.bonusNormalSummons ?? { p1: 0, p2: 0 },
    effectsUsedThisTurn: state.effectsUsedThisTurn ?? [],
    activatedSpellThisTurn: Boolean(state.activatedSpellThisTurn),
    startingPlayer: state.startingPlayer ?? "p1",
    drewThisTurn: state.drewThisTurn ?? { p1: false, p2: false },
    attackedThisTurn: state.attackedThisTurn ?? [],
    debugTrace: state.debugTrace ?? [],
    lastEvent: state.lastEvent,
  };
}

function pushTrace(state: GameState, partial: Omit<ActivationTrace, "id" | "at"> & { at?: string }) {
  const row = recordTrace(partial);
  state.debugTrace = [row, ...(state.debugTrace ?? [])].slice(0, 40);
  if (!row.allowed) state.log.unshift(log(state, `Blocked: ${traceLine(row)}`));
  return row;
}

export function reduce(prev: GameState, action: GameAction): GameState {
  let state = normalizeGame(cloneState(prev));
  state.updatedAt = new Date().toISOString();

  switch (action.type) {
    case "DRAW": {
      const player = state.players[action.player];
      const n = action.count ?? 1;
      let drawn = 0;
      for (let i = 0; i < n; i += 1) {
        const card = player.deck.shift();
        if (!card) break;
        card.faceUp = true;
        player.hand.push(card);
        drawn += 1;
      }
      state.log.unshift(log(state, `${player.name} drew ${drawn}.`));
      if (state.phase === "DP" || action.count === 1) state.drewThisTurn[action.player] = true;
      break;
    }
    case "MILL": {
      const player = state.players[action.player];
      const n = action.count ?? 1;
      let milled = 0;
      for (let i = 0; i < n; i += 1) {
        const card = player.deck.shift();
        if (!card) break;
        card.faceUp = true;
        player.gy.unshift(card);
        milled += 1;
      }
      state.log.unshift(log(state, `${player.name} milled ${milled}.`));
      break;
    }
    case "SHUFFLE": {
      const player = state.players[action.player];
      shuffleInPlace(pileOf(player, action.zone));
      state.log.unshift(log(state, `${player.name} shuffled ${action.zone}.`));
      break;
    }
    case "MOVE": {
      if (action.manual) {
        const actor = action.player ?? (action.from.owner === "shared" ? state.activePlayer : action.from.owner);
        const check = isLegalManualMove(state, actor, action.from, action.to);
        if (!check.ok) {
          state.log.unshift(log(state, `Blocked: ${check.reason}`));
          break;
        }
      }
      const card = takeCard(state, action.from);
      if (!card) break;
      if (action.faceUp !== undefined) card.faceUp = action.faceUp;
      if (action.position) card.position = action.position;
      if (action.to.zone === "hand" || action.to.zone === "extra") card.faceUp = true;
      if (action.to.zone === "deck") card.faceUp = false;
      placeCard(state, action.to, card);
      if (action.to.zone === "st" && card.faceUp === false && card.setTurn == null) card.setTurn = state.turn;
      if (action.to.zone === "gy" && !card.isToken) {
        const who = action.to.owner;
        const controller = action.from.owner === "p1" || action.from.owner === "p2" ? action.from.owner : who;
        state.lastEvent = {
          type: "sent-gy",
          player: who,
          controller,
          cardId: card.cardId,
          instanceId: card.instanceId,
        };
      }
      if (action.to.zone === "hand" && !card.isToken && (action.from.zone === "deck" || action.from.zone === "extra")) {
        const who = action.to.owner;
        state.lastEvent = {
          type: "add-to-hand",
          player: who,
          toPlayer: who,
          controller: action.from.owner === "p1" || action.from.owner === "p2" ? action.from.owner : who,
          cardId: card.cardId,
          instanceId: card.instanceId,
          fromZone: action.from.zone === "extra" ? "extra" : "deck",
          phase: state.phase,
        };
        if (state.phase !== "DP") state.fetBox = "yellow";
      }
      state.log.unshift(
        log(
          state,
          `Moved ${cardLabel(card, true)}: ${labelRef(state, action.from)} → ${labelRef(state, action.to)}.`,
        ),
      );
      const toMonster = action.to.zone === "monster" || action.to.zone === "emz";
      const fromMonster = action.from.zone === "monster" || action.from.zone === "emz";
      const fromSummon =
        action.from.zone === "hand" ||
        action.from.zone === "extra" ||
        action.from.zone === "gy" ||
        action.from.zone === "banish" ||
        action.from.zone === "deck";
      if (toMonster && !fromMonster && fromSummon && card.faceUp) {
        const who = action.to.owner === "shared" ? state.activePlayer : action.to.owner;
        if (who === "p1" || who === "p2") {
          state.summonsThisTurn[who] = (state.summonsThisTurn[who] ?? 0) + 1;
        }
      }
      break;
    }
    case "FLIP": {
      const card = getCard(state, action.ref);
      if (!card) break;
      card.faceUp = !card.faceUp;
      state.log.unshift(log(state, `Flipped ${cardLabel(card, true)}.`));
      break;
    }
    case "ROTATE": {
      const card = getCard(state, action.ref);
      if (!card) break;
      card.position = card.position === "atk" ? "def" : "atk";
      state.log.unshift(log(state, `Changed ${cardLabel(card, true)} to ${card.position.toUpperCase()}.`));
      break;
    }
    case "COUNTER": {
      const card = getCard(state, action.ref);
      if (!card) break;
      card.counters = Math.max(0, card.counters + action.delta);
      break;
    }
    case "SET_LP": {
      const player = state.players[action.player];
      const next = action.mode === "set" ? action.amount : player.lp + action.amount;
      const before = player.lp;
      player.lp = Math.max(0, next);
      state.log.unshift(log(state, `${player.name} LP ${before} → ${player.lp}.`));
      break;
    }
    case "NEXT_PHASE": {
      const i = PHASES.indexOf(state.phase);
      if (i >= PHASES.length - 1) {
        return reduce(state, { type: "NEXT_TURN" });
      }
      let next = PHASES[i + 1]!;
      if (next === "BP" && isFirstTurnStartingPlayer(state)) {
        next = "M2";
        state.log.unshift(log(state, NO_T1_BATTLE));
      }
      state.phase = next;
      state.log.unshift(log(state, `Phase → ${state.phase}.`));
      break;
    }
    case "PREV_PHASE": {
      const i = PHASES.indexOf(state.phase);
      if (i <= 0) break;
      let prev = PHASES[i - 1]!;
      if (prev === "BP" && isFirstTurnStartingPlayer(state)) {
        prev = "M1";
        state.log.unshift(log(state, NO_T1_BATTLE));
      }
      state.phase = prev;
      break;
    }
    case "NEXT_TURN": {
      state.activePlayer = state.activePlayer === "p1" ? "p2" : "p1";
      state.turn += 1;
      state.phase = "DP";
      state.fetBox = "A";
      state.summonsThisTurn = { p1: 0, p2: 0 };
      state.normalSummonUsed = { p1: false, p2: false };
      state.bonusNormalSummons = { p1: 0, p2: 0 };
      state.effectsUsedThisTurn = [];
      state.activatedSpellThisTurn = false;
      state.attackedThisTurn = [];
      state.drewThisTurn = { p1: false, p2: false };
      const clearNegation = (card: ZoneCard | null | undefined) => {
        if (card?.effectsNegatedUntilTurn != null && card.effectsNegatedUntilTurn < state.turn) {
          delete card.effectsNegatedUntilTurn;
        }
        if (card?.atkHalvedUntilTurn != null && card.atkHalvedUntilTurn < state.turn) {
          delete card.atkHalvedUntilTurn;
        }
      };
      state.negatedNamesUntilTurn = (state.negatedNamesUntilTurn ?? []).filter((n) => n.untilTurn >= state.turn);
      for (const pid of ["p1", "p2"] as PlayerId[]) {
        state.players[pid].monsters.forEach(clearNegation);
      }
      state.emz.forEach(clearNegation);
      if (state.chain.links.length) {
        state.log.unshift(log(state, "Warning: a Chain was still open at turn change — cleared."));
        state.chain = structuredClone(EMPTY_CHAIN);
      }
      const player = state.players[state.activePlayer];
      state.log.unshift(log(state, `Turn ${state.turn} · ${player.name}.`));
      // Only the very first turn of the duel skips the draw (opening hand already dealt).
      const openingSkip = state.turn === 1 && state.activePlayer === state.startingPlayer;
      if (openingSkip) {
        state.drewThisTurn[state.activePlayer] = true;
        state.log.unshift(log(state, `${player.name} skips the opening Draw Phase draw.`));
        break;
      }
      return reduce(state, { type: "DRAW", player: state.activePlayer, count: 1 });
    }
    case "ATTACK": {
      if (state.phase !== "BP") {
        state.log.unshift(log(state, "Attacks can only be declared in the Battle Phase."));
        break;
      }
      if (isFirstTurnStartingPlayer(state)) {
        state.log.unshift(log(state, "Cannot attack on the first turn of the duel."));
        break;
      }
      if (state.attackedThisTurn.includes(action.attackerId)) {
        state.log.unshift(log(state, "That monster already attacked this turn."));
        break;
      }
      state.attackedThisTurn.push(action.attackerId);
      const opp = otherPlayer(action.player);
      if (action.target) {
        const sitting = getCard(state, action.target);
        if (sitting && !sitting.faceUp) sitting.faceUp = true;
      }
      if (action.damage > 0) {
        const victimId = action.damagePlayer ?? opp;
        const victim = state.players[victimId];
        const before = victim.lp;
        victim.lp = Math.max(0, victim.lp - action.damage);
        state.log.unshift(log(state, `${victim.name} LP ${before} → ${victim.lp} (−${action.damage} battle damage).`));
      } else {
        state.log.unshift(log(state, `${state.players[action.player].name} declared an attack.`));
      }
      if (action.target && action.destroyTarget) {
        const tgt = takeCard(state, action.target);
        if (tgt) {
          tgt.faceUp = true;
          const owner = action.target.owner === "shared" ? opp : action.target.owner;
          sendToPile(state, owner, "gy", tgt);
          state.log.unshift(log(state, `Destroyed in battle.`));
        }
      }
      if (action.destroyAttacker) {
        const aRef = findCardRef(state, action.attackerId);
        if (aRef && aRef.owner !== "shared") {
          const atkCard = takeCard(state, aRef);
          if (atkCard) {
            atkCard.faceUp = true;
            sendToPile(state, aRef.owner, "gy", atkCard);
          }
        }
      }
      state.fetBox = "yellow";
      break;
    }
    case "DICE": {
      const value = String(1 + Math.floor(Math.random() * 6));
      state.lastRoll = { kind: "dice", value };
      state.log.unshift(log(state, `Dice: ${value}.`));
      break;
    }
    case "COIN": {
      const value = Math.random() < 0.5 ? "Heads" : "Tails";
      state.lastRoll = { kind: "coin", value };
      state.log.unshift(log(state, `Coin: ${value}.`));
      break;
    }
    case "TOKEN": {
      const player = state.players[action.player];
      const i = firstEmpty(player.monsters);
      if (i < 0) break;
      player.monsters[i] = {
        instanceId: nanoid(10),
        cardId: 0,
        name: action.name?.trim() || "Token",
        faceUp: true,
        position: "atk",
        counters: 0,
        overlay: [],
        isToken: true,
        tokenAtk: action.atk ?? 0,
        tokenDef: action.def ?? 0,
      };
      state.log.unshift(log(state, `${player.name} summoned a Token.`));
      break;
    }
    case "VIEW": {
      state.view = action.view;
      break;
    }
    case "NOTES": {
      state.notes = action.notes;
      break;
    }
    case "TOGGLE_ROTATE": {
      state.rotateOpponent = !state.rotateOpponent;
      break;
    }
    case "EVENT": {
      state.fetBox = "yellow";
      state.log.unshift(log(state, `Event: ${action.name}. Trigger window (yellow box).`));
      break;
    }
    case "FLAG_SPELL_ACTIVATED": {
      state.activatedSpellThisTurn = true;
      break;
    }
    case "GRANT_NORMAL_SUMMON": {
      const n = Math.max(1, action.count ?? 1);
      state.bonusNormalSummons[action.player] = (state.bonusNormalSummons[action.player] ?? 0) + n;
      state.log.unshift(log(state, `${state.players[action.player].name} gains ${n} additional Normal Summon/Set.`));
      break;
    }
    case "MARK_EFFECT": {
      const row = {
        player: action.player,
        cardId: action.cardId,
        nameKey: optNameKey(action.cardName),
        clauseIndex: action.clauseIndex,
        instanceId: action.instanceId,
        scope: action.scope,
      };
      const dup = state.effectsUsedThisTurn.some(
        (u) =>
          u.player === row.player &&
          u.nameKey === row.nameKey &&
          u.clauseIndex === row.clauseIndex &&
          (row.scope === "soft" ? u.instanceId === row.instanceId : true),
      );
      if (!dup) state.effectsUsedThisTurn.push(row);
      break;
    }
    case "FET": {
      state.fetBox = action.box;
      break;
    }
    case "CHAIN_ADD": {
      const prevSpeed = state.chain.links.at(-1)?.spellSpeed ?? null;
      const topName = state.chain.links.at(-1)?.cardName;
      const traceBase = {
        cardName: action.cardName,
        player: action.player,
        kind: action.kind,
        spellSpeed: action.spellSpeed as 1 | 2 | 3,
        clauseIndex: action.clauseIndex,
        respondingTo: topName,
        source: "engine" as const,
      };
      if (
        action.instanceId &&
        state.chain.links.some(
          (l) => l.instanceId === action.instanceId && l.clauseIndex === action.clauseIndex && !action.segoc,
        )
      ) {
        pushTrace(state, {
          ...traceBase,
          allowed: false,
          reason: "Already on this Chain (same copy + clause).",
        });
        break;
      }
      if (action.spellSpeed === 1 && prevSpeed != null && !action.segoc) {
        pushTrace(state, {
          ...traceBase,
          allowed: false,
          reason: `SS1 cannot chain to SS${prevSpeed} ${topName ?? ""} (SEGOC only for simultaneous triggers).`,
        });
        break;
      }
      if (prevSpeed === 3 && action.spellSpeed < 3) {
        pushTrace(state, {
          ...traceBase,
          allowed: false,
          reason: "Only Spell Speed 3 can respond to a Counter Trap.",
        });
        break;
      }
      if (prevSpeed != null && action.spellSpeed < prevSpeed && !action.segoc) {
        pushTrace(state, {
          ...traceBase,
          allowed: false,
          reason: `SS${action.spellSpeed} cannot chain to SS${prevSpeed}.`,
        });
        break;
      }
      const link = {
        id: nanoid(8),
        link: state.chain.links.length + 1,
        player: action.player,
        cardId: action.cardId,
        cardName: action.cardName,
        instanceId: action.instanceId,
        spellSpeed: action.spellSpeed,
        kind: action.kind,
        label: action.label,
        mandatory: action.mandatory,
        clauseIndex: action.clauseIndex,
        cardActivation: action.cardActivation,
        leavesTo: action.leavesTo,
        clauseText: action.clauseText,
        includes: action.includes,
        pendingResolve: action.pendingResolve,
      };
      state.chain.links.push(link);
      if (action.negatesPrevious && state.chain.links.length >= 2) {
        const prev = state.chain.links[state.chain.links.length - 2]!;
        prev.negated = true;
        state.log.unshift(
          log(
            state,
            `${action.cardName} negated the ${/activation/i.test(action.label + action.kind) ? "activation" : "effect"} of ${prev.cardName}.`,
          ),
        );
      }
      if (action.negatesPrevious && action.instanceId) {
        const ref = findCardRef(state, action.instanceId);
        if (ref && ref.owner !== "shared" && ref.zone === "hand") {
          const piece = takeCard(state, ref);
          if (piece) {
            piece.faceUp = true;
            sendToPile(state, action.player, "gy", piece);
            state.log.unshift(log(state, `${state.players[action.player].name} discarded ${action.cardName} (cost).`));
          }
        }
      }
      state.chain.complete = false;
      state.chain.consecutivePasses = 0;
      state.chain.pendingPlayer = otherPlayer(action.player);
      state.fetBox = "D";
      if (action.cardActivation) {
        state.lastEvent = {
          type: "activation",
          player: action.player,
          controller: action.player,
          cardId: action.cardId,
          instanceId: action.instanceId,
        };
      }
      const inc = action.includes?.length ? ` · includes ${action.includes.join(", ")}` : "";
      state.log.unshift(
        log(
          state,
          `CL${link.link} ${state.players[action.player].name}: ${action.cardName} (SS${action.spellSpeed} · ${action.kind}${inc}).`,
        ),
      );
      pushTrace(state, {
        ...traceBase,
        allowed: true,
        chainLink: link.link,
        reason: action.label || `Added to chain as CL${link.link}.`,
      });
      break;
    }
    case "DEBUG_NOTE": {
      pushTrace(state, { ...action.trace, source: action.trace.source ?? "ui" });
      break;
    }
    case "CHAIN_PASS": {
      if (!state.chain.links.length) {
        if (action.player === state.activePlayer) state.fetBox = "E";
        else state.fetBox = "A";
        state.log.unshift(log(state, `${state.players[action.player].name} passed.`));
        break;
      }
      state.chain.consecutivePasses += 1;
      state.chain.pendingPlayer = otherPlayer(action.player);
      if (state.chain.consecutivePasses >= 2) {
        state.chain.complete = true;
        state.chain.pendingPlayer = null;
        state.log.unshift(log(state, "Both players passed. Chain is complete — resolve from the top."));
        while (state.chain.links.length) state = resolveChainTop(state);
      } else {
        state.log.unshift(log(state, `${state.players[action.player].name} passed on the Chain.`));
      }
      break;
    }
    case "CHAIN_NEGATE_TOP": {
      const top = state.chain.links.at(-1);
      if (top) {
        top.negated = true;
        state.log.unshift(log(state, `CL${top.link} ${top.cardName} marked negated.`));
      }
      break;
    }
    case "CHAIN_RESOLVE_ONE": {
      state = resolveChainTop(state);
      break;
    }
    case "CHAIN_FINISH": {
      while (state.chain.links.length) {
        const top = state.chain.links.pop()!;
        state.chain.resolved.unshift(top);
        state = sendActivatedToGy(state, top.instanceId, top.leavesTo === "gy");
      }
      state.chain.complete = false;
      state.chain.pendingPlayer = null;
      state.chain.consecutivePasses = 0;
      state.fetBox = "yellow";
      state.log.unshift(log(state, "Resolved remaining Chain Links. Yellow box."));
      break;
    }
    case "SETTLE_ACTIVATION": {
      state = sendActivatedToGy(state, action.instanceId, false);
      break;
    }
    case "CHAIN_CLEAR": {
      state.chain = structuredClone(EMPTY_CHAIN);
      state.fetBox = "A";
      state.log.unshift(log(state, "Chain helper cleared. Open game state."));
      break;
    }
    case "NEGATE_CARDS": {
      for (const id of action.instanceIds) {
        const ref = findCardRef(state, id);
        if (!ref) continue;
        if (ref.zone === "emz") {
          const mon = state.emz[ref.index];
          if (!mon) continue;
          mon.effectsNegatedUntilTurn = action.untilTurn;
          if (action.halfAtk) mon.atkHalvedUntilTurn = action.untilTurn;
          if (action.banish) {
            const piece = takeCard(state, ref);
            if (piece) {
              piece.faceUp = true;
              sendToPile(state, state.activePlayer, "banish", piece);
            }
          }
          state.log.unshift(log(state, `${mon.name ?? id}: effects negated${action.halfAtk ? ", ATK halved" : ""}${action.banish ? ", banished" : ""} until EoT.`));
          continue;
        }
        if (ref.zone === "monster") {
          const mon = state.players[ref.owner].monsters[ref.index] ?? null;
          if (!mon) continue;
          mon.effectsNegatedUntilTurn = action.untilTurn;
          if (action.halfAtk) mon.atkHalvedUntilTurn = action.untilTurn;
          if (action.banish) {
            const piece = takeCard(state, ref);
            if (piece) {
              piece.faceUp = true;
              sendToPile(state, ref.owner, "banish", piece);
            }
          }
          state.log.unshift(log(state, `${mon.name ?? id}: effects negated${action.halfAtk ? ", ATK halved" : ""}${action.banish ? ", banished" : ""} until EoT.`));
          continue;
        }
        if (ref.zone === "st" || ref.zone === "field") {
          const st = ref.zone === "field" ? state.players[ref.owner].field : state.players[ref.owner].spells[ref.index ?? 0];
          if (st) st.effectsNegatedUntilTurn = action.untilTurn;
          if (action.banish) {
            const piece = takeCard(state, ref);
            if (piece) {
              piece.faceUp = true;
              sendToPile(state, ref.owner, "banish", piece);
            }
          }
          state.log.unshift(log(state, `${st?.name ?? id}: effects negated${action.banish ? ", banished" : ""} until EoT.`));
        }
      }
      break;
    }
    case "NEGATE_NAME": {
      state.negatedNamesUntilTurn = [...(state.negatedNamesUntilTurn ?? []), { nameKey: action.nameKey, untilTurn: action.untilTurn }];
      const key = action.nameKey.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const mark = (card: ZoneCard | null | undefined) => {
        if (!card?.faceUp) return;
        const n = (card.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (n && n === key) card.effectsNegatedUntilTurn = action.untilTurn;
      };
      for (const pid of ["p1", "p2"] as PlayerId[]) {
        state.players[pid].monsters.forEach(mark);
        state.players[pid].spells.forEach(mark);
        mark(state.players[pid].field);
      }
      state.emz.forEach(mark);
      state.log.unshift(log(state, `Cards named "${action.nameKey}" have their effects negated until EoT.`));
      break;
    }
    case "OVERLAY": {
      const material = takeCard(state, action.from);
      const target = getCard(state, action.onto);
      if (!material || !target) {
        if (material) placeCard(state, action.from, material);
        break;
      }
      target.overlay.push(material);
      state.log.unshift(log(state, `Attached material to ${target.name ?? target.cardId}.`));
      break;
    }
    case "PLAY": {
      const player = state.players[action.player];
      const slot = action.slot;
      if (action.mode === "summon-atk" || action.mode === "summon-def" || action.mode === "set-monster") {
        const fromZone = action.from.zone;
        const special = Boolean(action.special) || fromZone === "extra" || fromZone === "gy" || fromZone === "banish" || fromZone === "deck" || fromZone === "emz";
        const summonId = getCard(state, action.from)?.instanceId;
        if (fromZone === "extra" && !action.materials?.length && !action.effectSummon) {
          state.log.unshift(log(state, `Blocked: Extra Deck summons need materials from the card text.`));
          break;
        }
        const overlay: ZoneCard[] = [];
        if (special && action.materials?.length) {
          const mats = [...action.materials].sort((a, b) => {
            if (a.zone === "hand" && b.zone === "hand") return (b.index ?? 0) - (a.index ?? 0);
            if (a.zone === b.zone) {
              const bi = "index" in b ? (b.index ?? 0) : 0;
              const ai = "index" in a ? (a.index ?? 0) : 0;
              return bi - ai;
            }
            return 0;
          });
          for (const mat of mats) {
            const piece = takeCard(state, mat);
            if (!piece) continue;
            piece.faceUp = true;
            if (action.materialsMode === "overlay") overlay.push(piece);
            else if (action.materialsMode === "banish") {
              piece.faceUp = true;
              const owner = mat.owner === "shared" ? action.player : mat.owner;
              sendToPile(state, owner, "banish", piece);
            } else {
              const owner = mat.owner === "shared" ? action.player : mat.owner;
              sendToPile(state, owner, "gy", piece);
            }
          }
          state.log.unshift(
            log(
              state,
              action.materialsMode === "overlay"
                ? `${player.name} overlaid ${action.materials.length} material(s).`
                : `${player.name} used ${action.materials.length} material(s).`,
            ),
          );
        }
        let summonFrom = action.from;
        if (summonId) {
          const live = findCardRef(state, summonId);
          if (live) summonFrom = live;
        }
        const destIndex = action.materials?.length ? firstEmpty(player.monsters) : (slot ?? firstEmpty(player.monsters));
        if (destIndex < 0) {
          state.log.unshift(log(state, `${player.name} has no open monster zone.`));
          break;
        }
        if (!special && fromZone === "hand") {
          if (!canNormalSummonOrSet(state, action.player)) {
            state.log.unshift(log(state, `${player.name} already used a Normal Summon/Set this turn.`));
            break;
          }
          for (const trib of action.tributes ?? []) {
            const mat = takeCard(state, trib);
            if (!mat) continue;
            mat.faceUp = true;
            sendToPile(state, action.player, "gy", mat);
          }
        }
        const faceUp = action.mode !== "set-monster";
        const position = action.mode === "summon-atk" ? "atk" : "def";
        state = reduce(state, {
          type: "MOVE",
          from: summonFrom,
          to: { owner: action.player, zone: "monster", index: destIndex },
          faceUp,
          position,
        });
        if (overlay.length) {
          const boss = state.players[action.player].monsters[destIndex];
          if (boss) boss.overlay.push(...overlay);
        }
        const verb = special
          ? `Special Summoned in ${position.toUpperCase()}`
          : action.mode === "set-monster"
            ? "Normal Set a monster"
            : `Normal Summoned in ${position.toUpperCase()}`;
        state.log.unshift(log(state, `${player.name}: ${verb}.`));
        state.fetBox = "yellow";
        {
          const summoned = state.players[action.player].monsters[destIndex];
          state.lastEvent = {
            type: "summon",
            player: action.player,
            controller: action.player,
            cardId: summoned?.cardId,
            instanceId: summoned?.instanceId,
            summonKind: special ? "special" : action.mode === "set-monster" ? "set" : "normal",
          };
        }
        state.summonsThisTurn[action.player] = (state.summonsThisTurn[action.player] ?? 0) + 1;
        if (!special && fromZone === "hand") {
          if (state.normalSummonUsed[action.player]) {
            state.bonusNormalSummons[action.player] = Math.max(0, (state.bonusNormalSummons[action.player] ?? 0) - 1);
          } else {
            state.normalSummonUsed[action.player] = true;
          }
        }
        break;
      }
      if (action.mode === "set-st" || action.mode === "activate-st") {
        if (action.from.owner === action.player && action.from.zone === "field" && action.mode === "activate-st") {
          const existing = player.field;
          if (existing) {
            existing.faceUp = true;
            delete existing.setTurn;
            if (action.leaveOnResolve) existing.leaveOnResolve = action.leaveOnResolve;
            state.log.unshift(log(state, `${player.name}: Activated a Spell/Trap.`));
            state.fetBox = "D";
            break;
          }
        }
        if (action.from.owner === action.player && action.from.zone === "st" && typeof action.from.index === "number") {
          const existing = player.spells[action.from.index];
          if (existing) {
            existing.faceUp = action.mode === "activate-st";
            if (action.mode === "activate-st") {
              delete existing.setTurn;
              if (action.leaveOnResolve) existing.leaveOnResolve = action.leaveOnResolve;
            } else {
              existing.setTurn = state.turn;
            }
            state.log.unshift(
              log(state, `${player.name}: ${action.mode === "set-st" ? "Set a Spell/Trap." : "Activated a Spell/Trap."}`),
            );
            if (action.mode === "activate-st") state.fetBox = "D";
            break;
          }
        }
        const destIndex = slot ?? firstEmpty(player.spells);
        if (destIndex < 0) {
          state.log.unshift(log(state, `${player.name} has no open Spell/Trap zone.`));
          break;
        }
        state = reduce(state, {
          type: "MOVE",
          from: action.from,
          to: { owner: action.player, zone: "st", index: destIndex },
          faceUp: action.mode === "activate-st",
          position: "atk",
        });
        const placed = state.players[action.player].spells[destIndex];
        if (placed) {
          if (action.mode === "set-st") placed.setTurn = state.turn;
          else delete placed.setTurn;
          if (action.mode === "activate-st" && action.leaveOnResolve) placed.leaveOnResolve = action.leaveOnResolve;
        }
        state.log.unshift(
          log(state, `${player.name}: ${action.mode === "set-st" ? "Set a Spell/Trap." : "Activated a Spell/Trap."}`),
        );
        if (action.mode === "activate-st") {
          state.fetBox = "D";
        }
        break;
      }
      if (action.mode === "to-field") {
        state = reduce(state, {
          type: "MOVE",
          from: action.from,
          to: { owner: action.player, zone: "field" },
          faceUp: true,
        });
        const placed = state.players[action.player].field;
        if (placed) delete placed.setTurn;
        state.log.unshift(log(state, `${player.name}: Activated a Field Spell.`));
        state.fetBox = "D";
        break;
      }
      break;
    }
    case "DETACH": {
      const card = getCard(state, action.ref);
      if (!card?.overlay.length) break;
      const mat = card.overlay.pop()!;
      mat.faceUp = true;
      const owner = action.ref.owner === "shared" ? "p1" : action.ref.owner;
      sendToPile(state, owner, "gy", mat);
      state.log.unshift(log(state, `Detached material from ${card.name ?? card.cardId} to GY.`));
      break;
    }
    case "RESET_HANDS": {
      for (const id of ["p1", "p2"] as PlayerId[]) {
        const player = state.players[id];
        player.deck.push(
          ...player.hand.splice(0),
          ...player.gy.splice(0),
          ...player.banish.splice(0),
        );
        player.monsters = player.monsters.map((c) => {
          if (c && !c.isToken) player.deck.push(c);
          return null;
        });
        player.spells = player.spells.map((c) => {
          if (c) player.deck.push(c);
          return null;
        });
        if (player.field) {
          player.deck.push(player.field);
          player.field = null;
        }
        shuffleInPlace(player.deck);
        for (const card of player.deck) card.faceUp = false;
      }
      state.emz = [null, null];
      const n = action.draw ?? 5;
      state = reduce(state, { type: "DRAW", player: "p1", count: n });
      state = reduce(state, { type: "DRAW", player: "p2", count: n });
      state.log.unshift(log(state, `Board reset. Redrew ${n}.`));
      break;
    }
    default:
      break;
  }

  if (isFirstTurnStartingPlayer(state) && state.phase === "BP") {
    state.phase = "M2";
    state.log.unshift(log(state, NO_T1_BATTLE));
  }

  state.log = state.log.slice(0, 200);
  return state;
}

export function zoneKey(ref: ZoneRef) {
  if (ref.owner === "shared") return `shared:emz:${ref.index}`;
  if ("index" in ref && ref.index !== undefined) return `${ref.owner}:${ref.zone}:${ref.index}`;
  return `${ref.owner}:${ref.zone}`;
}

export function parseZoneKey(key: string): ZoneRef | null {
  const parts = key.split(":");
  if (parts[0] === "shared" && parts[1] === "emz") {
    const index = Number(parts[2]) as 0 | 1;
    return { owner: "shared", zone: "emz", index };
  }
  const owner = parts[0] as PlayerId;
  const zone = parts[1] as ZoneRef["zone"];
  if (!owner || !zone) return null;
  if (zone === "field") return { owner, zone: "field" };
  if (zone === "monster" || zone === "st") {
    return { owner, zone, index: Number(parts[2]) };
  }
  if (zone === "emz") return null;
  const index = parts[2] !== undefined ? Number(parts[2]) : undefined;
  return { owner, zone: zone as PileZone, index };
}

export function findCardRef(state: GameState, instanceId: string): ZoneRef | null {
  for (const emzIndex of [0, 1] as const) {
    if (state.emz[emzIndex]?.instanceId === instanceId) {
      return { owner: "shared", zone: "emz", index: emzIndex };
    }
  }
  for (const owner of ["p1", "p2"] as PlayerId[]) {
    const p = state.players[owner];
    if (p.field?.instanceId === instanceId) return { owner, zone: "field" };
    for (let i = 0; i < p.monsters.length; i += 1) {
      if (p.monsters[i]?.instanceId === instanceId) return { owner, zone: "monster", index: i };
    }
    for (let i = 0; i < p.spells.length; i += 1) {
      if (p.spells[i]?.instanceId === instanceId) return { owner, zone: "st", index: i };
    }
    for (const zone of ["hand", "deck", "gy", "banish", "extra", "side"] as PileZone[]) {
      const idx = p[zone].findIndex((c) => c.instanceId === instanceId);
      if (idx >= 0) return { owner, zone, index: idx };
    }
  }
  return null;
}
