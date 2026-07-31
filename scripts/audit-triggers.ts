import { readFileSync } from "node:fs";
import { parseCard } from "../src/lib/rules/psct";
import { conditionMatchesEvent, conditionText, isAutoPromptable, type DuelEvent } from "../src/lib/rules/triggerMatch";
import { findTriggerPrompts } from "../src/lib/rules/triggers";
import type { CompactCard } from "../src/lib/cards/types";
import type { GameState, PlayerId, ZoneCard } from "../src/lib/game/types";
import { EMPTY_CHAIN } from "../src/lib/rules/chain";

const cards = JSON.parse(readFileSync("data/cache/cards.compact.json", "utf8")) as CompactCard[];
const byName = new Map(cards.map((c) => [c.name.toLowerCase(), c]));

function card(name: string) {
  const c = byName.get(name.toLowerCase()) ?? cards.find((x) => x.name.toLowerCase().includes(name.toLowerCase()));
  if (!c) throw new Error(`missing ${name}`);
  return c;
}

function evalCard(c: CompactCard, event: DuelEvent, isEventCard: boolean) {
  return parseCard(c)
    .filter((cl) => isAutoPromptable(cl) && conditionMatchesEvent(cl, event, { owner: "p1", isEventCard }))
    .map((cl) => conditionText(cl) || cl.raw.slice(0, 80));
}

type Case = {
  name: string;
  card: string;
  event: DuelEvent;
  self?: boolean;
  expect: boolean;
  note?: string;
};

const cases: Case[] = [
  { name: "DM no trigger", card: "Dark Magician", event: { type: "summon", summonKind: "normal", controller: "p1" }, self: true, expect: false },
  { name: "DMG continuous", card: "Dark Magician Girl", event: { type: "summon", summonKind: "normal", controller: "p1" }, self: true, expect: false },
  { name: "Stratos self NS", card: "Elemental HERO Stratos", event: { type: "summon", summonKind: "normal", controller: "p1" }, self: true, expect: true },
  { name: "Stratos self SS", card: "Elemental HERO Stratos", event: { type: "summon", summonKind: "special", controller: "p1" }, self: true, expect: true },
  { name: "Stratos other summon", card: "Elemental HERO Stratos", event: { type: "summon", summonKind: "normal", controller: "p1" }, self: false, expect: false },
  { name: "Sage NS only on NS", card: "Sage with Eyes of Blue", event: { type: "summon", summonKind: "normal", controller: "p1" }, self: true, expect: true },
  { name: "Sage NS not on SS", card: "Sage with Eyes of Blue", event: { type: "summon", summonKind: "special", controller: "p1" }, self: true, expect: false },
  { name: "Sangan self GY", card: "Sangan", event: { type: "sent-gy", controller: "p1" }, self: true, expect: true },
  { name: "Sangan not others", card: "Sangan", event: { type: "sent-gy", controller: "p1" }, self: false, expect: false },
  { name: "Ash not on summon", card: "Ash Blossom & Joyous Spring", event: { type: "summon", summonKind: "special", controller: "p2" }, self: false, expect: false },
  { name: "Ash on activation", card: "Ash Blossom & Joyous Spring", event: { type: "activation", controller: "p2" }, self: false, expect: true },
  { name: "Veiler not on summon", card: "Effect Veiler", event: { type: "summon", summonKind: "normal", controller: "p2" }, self: false, expect: false },
  { name: "Maxx C not on summon", card: 'Maxx "C"', event: { type: "summon", summonKind: "special", controller: "p2" }, self: false, expect: false },
  { name: "Nibiru not every summon", card: "Nibiru, the Primal Being", event: { type: "summon", summonKind: "special", controller: "p2" }, self: false, expect: false, note: "needs 5 summons; we must not false-prompt" },
  { name: "Torrential on summon", card: "Torrential Tribute", event: { type: "summon", summonKind: "normal", controller: "p1" }, self: false, expect: true },
  { name: "Bottomless opp summon", card: "Bottomless Trap Hole", event: { type: "summon", summonKind: "special", controller: "p2" }, self: false, expect: true },
  { name: "Bottomless your summon", card: "Bottomless Trap Hole", event: { type: "summon", summonKind: "special", controller: "p1" }, self: false, expect: false },
  { name: "Mirror Force not on summon", card: "Mirror Force", event: { type: "summon", summonKind: "normal", controller: "p2" }, self: false, expect: false },
  { name: "Malicious GY ign not on GY send other", card: "Destiny HERO - Malicious", event: { type: "sent-gy", controller: "p1" }, self: false, expect: false },
  { name: "Malicious GY ign not on self send", card: "Destiny HERO - Malicious", event: { type: "sent-gy", controller: "p1" }, self: true, expect: false },
  { name: "Imperm not on summon", card: "Infinite Impermanence", event: { type: "summon", summonKind: "normal", controller: "p1" }, self: false, expect: false },
  { name: "Eternal Soul not on summon", card: "Eternal Soul", event: { type: "summon", summonKind: "special", controller: "p1" }, self: false, expect: false },
  { name: "Maiden not on generic activation", card: "Maiden with Eyes of Blue", event: { type: "activation", controller: "p2" }, self: false, expect: false, note: "targets this card only" },
  { name: "Solemn Strike on SS", card: "Solemn Strike", event: { type: "summon", summonKind: "special", controller: "p2" }, self: false, expect: true },
  { name: "Standby no false on DM", card: "Dark Magician", event: { type: "phase", phase: "SP", controller: "p1" }, self: false, expect: false },
];

let fail = 0;
for (const c of cases) {
  const got = evalCard(card(c.card), c.event, c.self ?? false).length > 0;
  const ok = got === c.expect;
  if (!ok) {
    fail += 1;
    const clauses = parseCard(card(c.card)).map((cl) => `${cl.kind}|${conditionText(cl) || "∅"}`);
    console.log("FAIL", c.name, "expected", c.expect, "got", got, c.note ?? "");
    console.log("   ", clauses);
  } else console.log("ok  ", c.name);
}
console.log(fail ? `\n${fail} FAILED` : "\nall clause cases passed");

function zc(c: CompactCard, faceUp = true): ZoneCard {
  return {
    instanceId: `i-${c.id}`,
    cardId: c.id,
    name: c.name,
    faceUp,
    position: "atk",
    counters: 0,
    overlay: [],
  };
}
function emptyPlayer(id: PlayerId, name: string) {
  return {
    id,
    name,
    lp: 8000,
    deck: [] as ZoneCard[],
    hand: [] as ZoneCard[],
    gy: [] as ZoneCard[],
    banish: [] as ZoneCard[],
    extra: [] as ZoneCard[],
    side: [] as ZoneCard[],
    monsters: [null, null, null, null, null] as Array<ZoneCard | null>,
    spells: [null, null, null, null, null] as Array<ZoneCard | null>,
    field: null as ZoneCard | null,
  };
}

const stratos = card("Elemental HERO Stratos");
const ash = card("Ash Blossom & Joyous Spring");
const veiler = card("Effect Veiler");
const torrential = card("Torrential Tribute");
const sangan = card("Sangan");
const dm = card("Dark Magician");

const state = {
  id: "t",
  formatId: "advanced",
  turn: 1,
  phase: "M1",
  activePlayer: "p1",
  players: {
    p1: {
      ...emptyPlayer("p1", "P1"),
      monsters: [zc(stratos), zc(dm), null, null, null],
      spells: [zc(torrential, false), null, null, null, null],
      hand: [zc(ash), zc(veiler)],
    },
    p2: emptyPlayer("p2", "P2"),
  },
  emz: [null, null],
  log: [],
  notes: "",
  view: "god",
  chain: structuredClone(EMPTY_CHAIN),
  fetBox: "A",
  summonsThisTurn: { p1: 0, p2: 0 },
  normalSummonUsed: { p1: false, p2: false },
  bonusNormalSummons: { p1: 0, p2: 0 },
  effectsUsedThisTurn: [],
  activatedSpellThisTurn: false,
  startingPlayer: "p1",
  drewThisTurn: { p1: false, p2: false },
  attackedThisTurn: [],
  createdAt: "",
  updatedAt: "",
} as GameState;

const byId = new Map(cards.map((c) => [c.id, c]));
const summonDm = findTriggerPrompts(state, byId, {
  type: "summon",
  summonKind: "normal",
  controller: "p1",
  player: "p1",
  cardId: dm.id,
  instanceId: `i-${dm.id}`,
});
console.log(
  "\nBoard summon DM prompts:",
  summonDm.map((p) => `${p.cardName} (${p.owner})`),
);
const names = summonDm.map((p) => p.cardName);
const boardFail =
  names.includes("Elemental HERO Stratos") ||
  names.includes("Ash Blossom & Joyous Spring") ||
  names.includes("Effect Veiler") ||
  names.includes("Dark Magician") ||
  !names.includes("Torrential Tribute");
if (boardFail) {
  console.log("FAIL board summon scan — expected only Torrential (and similar watchers), not Stratos/Ash/Veiler/DM");
  fail += 1;
} else console.log("ok   board summon scan");

const sanganZ = zc(sangan);
state.players.p1.monsters[0] = null;
state.players.p1.gy = [sanganZ];
const gyPrompts = findTriggerPrompts(state, byId, {
  type: "sent-gy",
  controller: "p1",
  player: "p1",
  cardId: sangan.id,
  instanceId: sanganZ.instanceId,
});
console.log(
  "Sangan to GY prompts:",
  gyPrompts.map((p) => p.cardName),
);
if (!gyPrompts.some((p) => p.cardName === "Sangan")) {
  console.log("FAIL sangan self GY board");
  fail += 1;
} else console.log("ok   sangan self GY board");

const actPrompts = findTriggerPrompts(state, byId, {
  type: "activation",
  controller: "p2",
  player: "p2",
  cardId: 1,
});
console.log(
  "Activation prompts:",
  actPrompts.map((p) => p.cardName),
);
if (!actPrompts.some((p) => p.cardName.includes("Ash"))) {
  console.log("FAIL ash should prompt from hand on activation");
  fail += 1;
} else console.log("ok   ash hand activation");
if (actPrompts.some((p) => p.cardName.includes("Maiden"))) {
  console.log("FAIL maiden should not prompt on generic activation");
  fail += 1;
}

if (fail) {
  console.error(`\n${fail} FAILED`);
  process.exit(1);
}
console.log("\nall audit cases passed");
