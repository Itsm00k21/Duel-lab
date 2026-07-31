import { createGame, reduce } from "../src/lib/game/engine";
import type { DeckList } from "../src/lib/deck/types";

const ash = 14558127;
const foolish = 81439173;
const imperm = 10045474;

function tinyDeck(main: number[]): DeckList {
  return {
    id: "t",
    name: "t",
    formatId: "advanced",
    notes: "",
    main,
    extra: [],
    side: [],
    createdAt: "",
    updatedAt: "",
  };
}

const cases: Array<{ name: string; ok: boolean }> = [];
function check(name: string, cond: boolean) {
  cases.push({ name, ok: cond });
}

let state = createGame({
  formatId: "advanced",
  p1: { name: "P1", deck: tinyDeck([foolish, foolish, foolish, foolish, foolish, foolish]) },
  p2: { name: "P2", deck: tinyDeck([ash, ash, ash, ash, ash, ash]) },
  startingHand: 1,
  startingPlayer: "p1",
});

const p1Card = state.players.p1.hand[0]!;
state = reduce(state, {
  type: "CHAIN_ADD",
  player: "p1",
  cardId: p1Card.cardId,
  cardName: "Foolish Burial",
  instanceId: p1Card.instanceId,
  spellSpeed: 1,
  kind: "spell",
  label: "Send from Deck to GY",
  includes: ["send-deck-gy"],
  pendingResolve: {
    owner: "p1",
    instanceId: p1Card.instanceId,
    cardId: p1Card.cardId,
    cardActivation: true,
    searches: [
      {
        count: 1,
        source: "deck",
        sources: ["deck"],
        dest: "gy",
        quotedNames: [],
        archetypes: [],
        exceptNames: [],
        typeHint: "monster",
        extraKinds: [],
        attributes: [],
        races: [],
        label: "Send to GY from deck",
      },
    ],
  },
});

const beforeGy = state.players.p1.gy.length;
const p2Ash = state.players.p2.hand[0]!;
state = reduce(state, {
  type: "CHAIN_ADD",
  player: "p2",
  cardId: ash,
  cardName: "Ash Blossom & Joyous Spring",
  instanceId: p2Ash.instanceId,
  spellSpeed: 2,
  kind: "quick",
  label: "Negate that effect",
  negatesPrevious: true,
});

check("previous effect marked negated", Boolean(state.chain.links[0]?.negated));
check("Ash left the hand (cost)", !state.players.p2.hand.some((c) => c.instanceId === p2Ash.instanceId));
check("Ash in GY", state.players.p2.gy.some((c) => c.cardId === ash || c.instanceId === p2Ash.instanceId));

state = reduce(state, { type: "CHAIN_PASS", player: "p1" });
state = reduce(state, { type: "CHAIN_PASS", player: "p2" });
check("chain complete", state.chain.complete);

state = reduce(state, { type: "CHAIN_RESOLVE_ONE" });
state = reduce(state, { type: "CHAIN_RESOLVE_ONE" });

const foolishResolved = state.chain.resolved.find((l) => l.cardName === "Foolish Burial");
check("Foolish stayed negated after resolve", Boolean(foolishResolved?.negated));
check("Foolish pending was not cleared by engine (UI skips it)", Boolean(foolishResolved?.pendingResolve?.searches?.length));
check("no extra mill from engine alone", state.players.p1.gy.length === beforeGy || state.players.p1.gy.length <= beforeGy + 1);

// Imperm should also flag previous when negatesPrevious is set
state = createGame({
  formatId: "advanced",
  p1: { name: "P1", deck: tinyDeck([foolish, foolish, foolish, foolish, foolish, foolish]) },
  p2: { name: "P2", deck: tinyDeck([imperm, imperm, imperm, imperm, imperm, imperm]) },
  startingHand: 1,
  startingPlayer: "p1",
});
const monEff = state.players.p1.hand[0]!;
state = reduce(state, {
  type: "CHAIN_ADD",
  player: "p1",
  cardId: monEff.cardId,
  cardName: "Monster effect",
  instanceId: monEff.instanceId,
  spellSpeed: 1,
  kind: "ignition",
  label: "Add from Deck",
  pendingResolve: { owner: "p1", instanceId: monEff.instanceId, cardId: monEff.cardId, searches: [] },
});
state = reduce(state, {
  type: "CHAIN_ADD",
  player: "p2",
  cardId: imperm,
  cardName: "Infinite Impermanence",
  spellSpeed: 2,
  kind: "trap",
  label: "Negate its effects",
});
check("Imperm does not negate previous chain link", !state.chain.links[0]?.negated);

// Imperm/Veiler: mark the targeted monster, then skip its pending resolve.
state = createGame({
  formatId: "advanced",
  p1: { name: "P1", deck: tinyDeck([foolish, foolish, foolish, foolish, foolish, foolish]) },
  p2: { name: "P2", deck: tinyDeck([imperm, imperm, imperm, imperm, imperm, imperm]) },
  startingHand: 1,
  startingPlayer: "p1",
});
const berylLike = state.players.p1.hand[0]!;
state.players.p1.monsters[0] = { ...berylLike, faceUp: true, position: "atk" };
state.players.p1.hand = [];
state = reduce(state, {
  type: "CHAIN_ADD",
  player: "p1",
  cardId: berylLike.cardId,
  cardName: "Primite Dragon Ether Beryl",
  instanceId: berylLike.instanceId,
  spellSpeed: 1,
  kind: "trigger",
  label: "Set from Deck",
  pendingResolve: {
    owner: "p1",
    instanceId: berylLike.instanceId,
    cardId: berylLike.cardId,
    searches: [
      {
        count: 1,
        source: "deck",
        sources: ["deck"],
        dest: "set-st",
        quotedNames: ["Primite"],
        archetypes: [],
        exceptNames: [],
        typeHint: "spell-trap",
        extraKinds: [],
        attributes: [],
        races: [],
        label: "Set Primite S/T",
      },
    ],
  },
});
const p2Imp = state.players.p2.hand[0]!;
state = reduce(state, {
  type: "CHAIN_ADD",
  player: "p2",
  cardId: imperm,
  cardName: "Infinite Impermanence",
  instanceId: p2Imp.instanceId,
  spellSpeed: 2,
  kind: "trap",
  label: "Negate its effects",
  pendingResolve: {
    owner: "p2",
    instanceId: p2Imp.instanceId,
    cardId: imperm,
    cardActivation: true,
    targetInstanceIds: [berylLike.instanceId],
    negateMonsterUntilEot: true,
  },
});
check("Imperm still does not flag CL1.negated at activation", !state.chain.links[0]?.negated);
state = reduce(state, { type: "CHAIN_PASS", player: "p1" });
state = reduce(state, { type: "CHAIN_PASS", player: "p2" });
state = reduce(state, { type: "CHAIN_RESOLVE_ONE" });
check("monster marked negated after Imperm resolves", state.players.p1.monsters[0]?.effectsNegatedUntilTurn === state.turn);
state = reduce(state, { type: "CHAIN_RESOLVE_ONE" });
const monLink = state.chain.resolved.find((l) => l.cardName === "Primite Dragon Ether Beryl");
check("monster link still has pending (UI must skip via negate flag)", Boolean(monLink?.pendingResolve?.searches?.length));
check("monster is still effect-negated after its link resolves", state.players.p1.monsters[0]?.effectsNegatedUntilTurn === state.turn);

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "negate checks failed");
  process.exit(1);
}
console.log(`ok — ${cases.length} negate checks`);
