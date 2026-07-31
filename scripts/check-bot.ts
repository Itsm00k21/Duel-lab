import { createGame, reduce } from "../src/lib/game/engine";
import { decideBot, listLegalBotIntents } from "../src/lib/bot/decide";
import { findTriggerPrompts } from "../src/lib/rules/triggers";
import type { CompactCard } from "../src/lib/cards/types";
import type { GameState, ZoneCard } from "../src/lib/game/types";

function deck(main: number[], extra: number[] = []) {
  return {
    id: "t",
    name: "t",
    formatId: "advanced" as const,
    notes: "",
    main,
    extra,
    side: [] as number[],
    createdAt: "",
    updatedAt: "",
  };
}

function C(partial: Partial<CompactCard> & { id: number; name: string; type: string }): CompactCard {
  return { frameType: "effect", desc: partial.desc ?? "", ...partial };
}

const pole = C({ id: 1, name: "Mystical Elf", type: "Normal Monster", atk: 800, def: 2000, level: 4, frameType: "normal" });
const dm = C({ id: 2, name: "Dark Magician", type: "Normal Monster", atk: 2500, def: 2100, level: 7, frameType: "normal" });
const tuner = C({ id: 3, name: "Effect Veiler", type: "Tuner Monster", atk: 0, def: 0, level: 1, desc: "During your opponent's Main Phase (Quick Effect): You can send this card from your hand to the GY, then target 1 Effect Monster your opponent controls; negate the effects of that face-up monster until the end of this turn." });
const ash = C({ id: 4, name: "Ash Blossom & Joyous Spring", type: "Tuner Monster", atk: 0, def: 1800, level: 3, desc: "When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate that effect." });
const rota = C({ id: 5, name: "Reinforcement of the Army", type: "Spell Card", frameType: "spell", race: "Normal", desc: "Add 1 Level 4 or lower Warrior monster from your Deck to your hand." });
const imperm = C({ id: 6, name: "Infinite Impermanence", type: "Trap Card", frameType: "trap", race: "Normal", desc: "Target 1 face-up monster your opponent controls; negate its effects. If you control no cards, you can activate this card from your hand." });
const brd = C({ id: 7, name: "Black Rose Dragon", type: "Synchro Monster", frameType: "synchro", atk: 2400, level: 7, desc: "1 Tuner + 1+ non-Tuner monsters" });
const sp = C({
  id: 8,
  name: "S:P Little Knight",
  type: "Link Monster",
  frameType: "link",
  atk: 1600,
  linkval: 2,
  desc: "2 Effect Monsters, including a Link Monster",
});
const ip = C({
  id: 10,
  name: "I:P Masquerena",
  type: "Link Monster",
  frameType: "link",
  atk: 800,
  linkval: 2,
  desc: "2+ monsters with different names",
});
const gob = C({ id: 9, name: "Goblin Attack Force", type: "Effect Monster", atk: 2300, def: 0, level: 4 });

const byId = new Map<number, CompactCard>([pole, dm, tuner, ash, rota, imperm, brd, sp, gob, ip].map((c) => [c.id, c]));

function z(cardId: number, faceUp = true): ZoneCard {
  return { instanceId: `i${cardId}-${Math.random().toString(36).slice(2, 6)}`, cardId, faceUp, position: "atk", counters: 0, overlay: [] };
}

function base(over: Partial<GameState> = {}): GameState {
  let s = createGame({
    formatId: "advanced",
    startingPlayer: "p1",
    pve: { bot: "p2", premadeId: "generic", deckName: "Bot" },
    p1: { name: "You", deck: deck(Array(40).fill(pole.id), [sp.id]) },
    p2: { name: "Bot", deck: deck(Array(40).fill(pole.id), [brd.id, sp.id]) },
  });
  s = { ...s, ...over, players: { ...s.players, ...(over.players ?? {}) }, pve: over.pve ?? s.pve };
  return s;
}

const cases: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, cond: boolean, detail?: string) {
  cases.push({ name, ok: cond, detail });
}

// Bot not turn player → null
{
  const s = base({ activePlayer: "p1", phase: "M1" });
  check("not turn → null", decideBot(s, byId, {}) == null);
}

// Bot won toss / goes first (startingPlayer p2, turn 1 M1)
{
  let s = base({ activePlayer: "p2", phase: "M1", turn: 1, startingPlayer: "p2" });
  const m = z(pole.id);
  s = { ...s, players: { ...s.players, p2: { ...s.players.p2, hand: [m], monsters: [null, null, null, null, null] } } };
  const d = decideBot(s, byId, {});
  check(
    "bot going first still NS",
    Boolean(d && d.type === "dispatch" && d.action.type === "PLAY" && d.action.mode === "summon-atk"),
    d?.note,
  );
}
{
  const s = createGame({
    formatId: "advanced",
    startingPlayer: "p2",
    pve: { bot: "p2", premadeId: "generic", deckName: "Bot" },
    p1: { name: "You", deck: deck(Array(40).fill(pole.id)) },
    p2: { name: "Bot", deck: deck(Array(40).fill(pole.id)) },
  });
  check("new game bot-first starts M1", s.phase === "M1" && s.activePlayer === "p2" && s.startingPlayer === "p2");
  const d = decideBot(s, byId, {});
  check("new game bot-first decides something", Boolean(d && d.type === "dispatch"), d?.note ?? d?.type);
}

// Empty M1 with no useful hand (only unknown ids stripped) — give empty hand + no monsters
{
  let s = base({ activePlayer: "p2", phase: "M1", turn: 1, startingPlayer: "p1" });
  s = {
    ...s,
    players: {
      ...s.players,
      p2: { ...s.players.p2, hand: [], monsters: [null, null, null, null, null], spells: [null, null, null, null, null], extra: [] },
    },
  };
  const d = decideBot(s, byId, {});
  check("no plays → leave M1", Boolean(d && d.type === "dispatch" && d.action.type === "NEXT_PHASE"));
}

// LV4 in hand → NS
{
  let s = base({ activePlayer: "p2", phase: "M1", turn: 2 });
  const m = z(pole.id);
  s = { ...s, players: { ...s.players, p2: { ...s.players.p2, hand: [m], monsters: [null, null, null, null, null] } } };
  const d = decideBot(s, byId, {});
  check(
    "LV4 → NS",
    Boolean(d && d.type === "dispatch" && d.action.type === "PLAY" && d.action.mode === "summon-atk"),
    d?.note,
  );
}

// LV7 no tribute → do not NS
{
  let s = base({ activePlayer: "p2", phase: "M1", turn: 2 });
  s = { ...s, players: { ...s.players, p2: { ...s.players.p2, hand: [z(dm.id)], monsters: [null, null, null, null, null] } } };
  const d = decideBot(s, byId, {});
  check("LV7 no tribute → not NS", !(d && d.type === "dispatch" && d.action.type === "PLAY" && d.action.mode === "summon-atk" && !d.action.special), d?.note);
}

// Extra with 0 monsters → no extra SS
{
  let s = base({ activePlayer: "p2", phase: "M1", turn: 2 });
  s = {
    ...s,
    players: {
      ...s.players,
      p2: { ...s.players.p2, hand: [], monsters: [null, null, null, null, null], extra: [z(brd.id, true)] },
    },
  };
  const plays = listLegalBotIntents(s, byId);
  check(
    "no materials → no extra",
    !plays.some((p) => p.type === "dispatch" && p.action.type === "PLAY" && p.action.special),
  );
}

// Tuner + non-tuner → synchro legal
{
  let s = base({ activePlayer: "p2", phase: "M1", turn: 2 });
  s = {
    ...s,
    players: {
      ...s.players,
      p2: {
        ...s.players.p2,
        hand: [],
        monsters: [z(tuner.id), z(pole.id), null, null, null],
        extra: [z(brd.id, true), z(sp.id, true), z(ip.id, true)],
      },
    },
  };
  const plays = listLegalBotIntents(s, byId);
  check(
    "two different names → I:P not illegal S:P",
    plays.some((p) => p.type === "dispatch" && p.note.includes("I:P Masquerena")) &&
      !plays.some((p) => p.type === "dispatch" && p.note.includes("S:P Little Knight")),
    plays.map((p) => p.note).join(" | "),
  );
}

// Single monster cannot Link-2
{
  let s = base({ activePlayer: "p2", phase: "M1", turn: 2 });
  s = {
    ...s,
    players: {
      ...s.players,
      p2: { ...s.players.p2, hand: [], monsters: [z(gob.id), null, null, null, null], extra: [z(sp.id, true), z(ip.id, true)] },
    },
  };
  const plays = listLegalBotIntents(s, byId);
  check(
    "1 monster → no link",
    !plays.some((p) => p.type === "dispatch" && p.action.type === "PLAY" && p.action.special),
    plays.map((p) => p.note).join(" | "),
  );
}

// Do not Ash own chain
{
  let s = base({ activePlayer: "p2", phase: "M1", turn: 2 });
  const ashZ = z(ash.id);
  s = {
    ...s,
    players: { ...s.players, p2: { ...s.players.p2, hand: [ashZ] } },
    chain: {
      links: [
        {
          id: "c1",
          link: 1,
          player: "p2",
          cardId: rota.id,
          cardName: "Reinforcement of the Army",
          spellSpeed: 1,
          kind: "spell",
          label: "act",
        },
      ],
      resolved: [],
      pendingPlayer: "p2",
      consecutivePasses: 1,
      complete: false,
    },
  };
  const d = decideBot(s, byId, {});
  check(
    "no self-ash",
    Boolean(d && d.type === "dispatch" && d.action.type === "CHAIN_PASS"),
    d?.note,
  );
}

// First turn no attack
{
  let s = base({ activePlayer: "p2", phase: "BP", turn: 1, startingPlayer: "p2" });
  s = { ...s, players: { ...s.players, p2: { ...s.players.p2, monsters: [z(gob.id), null, null, null, null] } } };
  const d = decideBot(s, byId, {});
  check("first turn no attack", Boolean(d && d.type === "dispatch" && d.action.type === "NEXT_PHASE" && d.note.toLowerCase().includes("first turn")), d?.note);
}

// Direct attack later turn
{
  let s = base({ activePlayer: "p2", phase: "BP", turn: 2, startingPlayer: "p1", attackedThisTurn: [] });
  s = {
    ...s,
    players: {
      ...s.players,
      p2: { ...s.players.p2, monsters: [z(gob.id), null, null, null, null] },
      p1: { ...s.players.p1, monsters: [null, null, null, null, null] },
    },
  };
  const d = decideBot(s, byId, {});
  check("direct attack", Boolean(d && d.type === "dispatch" && d.action.type === "ATTACK" && d.action.damage === 2300), d?.note);
}

// Suicide into bigger ATK skipped
{
  let s = base({ activePlayer: "p2", phase: "BP", turn: 2, startingPlayer: "p1", attackedThisTurn: [] });
  const wall = z(dm.id);
  s = {
    ...s,
    players: {
      ...s.players,
      p2: { ...s.players.p2, monsters: [z(pole.id), null, null, null, null] },
      p1: { ...s.players.p1, monsters: [wall, null, null, null, null] },
    },
  };
  const d = decideBot(s, byId, {});
  check("skip suicide attack", Boolean(d && d.type === "dispatch" && d.action.type === "NEXT_PHASE"), d?.note);
}

// Human prompt → wait
{
  const s = base({ activePlayer: "p2", phase: "M1" });
  const d = decideBot(s, byId, {
    prompt: {
      id: "x",
      owner: "p1",
      cardId: 1,
      cardName: "Torrential",
      clauseIndex: 0,
      summary: "x",
      eventLabel: "summon",
      mandatory: false,
      spellSpeed: 2,
      kind: "trigger",
    },
  });
  check("human prompt wait", Boolean(d && d.type === "wait"));
}

// Chain pending human → wait
{
  let s = base({ activePlayer: "p2", phase: "M1" });
  s = {
    ...s,
    chain: {
      links: [
        {
          id: "c1",
          link: 1,
          player: "p2",
          cardId: 5,
          cardName: "ROTA",
          spellSpeed: 1,
          kind: "spell",
          label: "act",
        },
      ],
      resolved: [],
      pendingPlayer: "p1",
      consecutivePasses: 0,
      complete: false,
    },
  };
  const d = decideBot(s, byId, {});
  check("chain wait", Boolean(d && d.type === "wait"));
}

// Trap in hand → set
{
  let s = base({ activePlayer: "p2", phase: "M2", turn: 2 });
  s = {
    ...s,
    players: {
      ...s.players,
      p2: { ...s.players.p2, hand: [z(imperm.id)], monsters: [null, null, null, null, null], spells: [null, null, null, null, null] },
    },
  };
  const d = decideBot(s, byId, {});
  check("set trap M2", Boolean(d && d.type === "dispatch" && d.action.type === "PLAY" && d.action.mode === "set-st"), d?.note);
}

{
  const lode = C({
    id: 56506740,
    name: "Primite Lordly Lode",
    type: "Spell Card",
    frameType: "spell",
    race: "Continuous",
    desc: 'When this card is activated: Add 1 "Primite" card from your Deck to your hand, except "Primite Lordly Lode".',
  });
  const cards = new Map(byId);
  cards.set(lode.id, lode);
  let s = base({ activePlayer: "p2", phase: "M1", turn: 1, startingPlayer: "p2", fetBox: "yellow" });
  const setLode = { ...z(lode.id, false), setTurn: 1 };
  s = {
    ...s,
    players: {
      ...s.players,
      p2: { ...s.players.p2, hand: [], monsters: [z(pole.id), null, null, null, null], spells: [setLode, null, null, null, null] },
    },
  };
  const d = decideBot(s, cards, {});
  check(
    "activate set continuous spell",
    Boolean(d && d.type === "dispatch" && d.action.type === "PLAY" && d.action.mode === "activate-st"),
    d?.note,
  );
}

{
  const stratos = C({
    id: 40044918,
    name: "Elemental HERO Stratos",
    type: "Effect Monster",
    desc: 'When this card is Normal or Special Summoned: You can activate 1 of these effects.\n● Add 1 "HERO" monster from your Deck to your hand.',
  });
  const cards = new Map(byId);
  cards.set(stratos.id, stratos);
  let s = base({ activePlayer: "p2", phase: "M1", turn: 1, startingPlayer: "p2" });
  const mon = z(stratos.id);
  s = { ...s, players: { ...s.players, p2: { ...s.players.p2, monsters: [mon, null, null, null, null], hand: [] } } };
  const withId = findTriggerPrompts(s, cards, {
    type: "summon",
    player: "p2",
    controller: "p2",
    cardId: stratos.id,
    instanceId: mon.instanceId,
    summonKind: "normal",
  });
  check(
    "on-summon search prompt when instance known",
    withId.some((p) => p.owner === "p2" && p.cardId === stratos.id && Boolean(p.search || /add /i.test(p.summary))),
    withId.map((p) => p.summary).join(" | "),
  );
  const noId = findTriggerPrompts(s, cards, { type: "summon", player: "p2", controller: "p2", summonKind: "normal" });
  check("on-summon without instance does not self-fire", !noId.some((p) => p.cardId === stratos.id));
  const yes = decideBot(s, cards, {
    prompt: {
      id: "st",
      owner: "p2",
      cardId: stratos.id,
      cardName: stratos.name,
      clauseIndex: 0,
      summary: 'Add 1 "HERO" monster from your Deck',
      eventLabel: "summon",
      mandatory: false,
      spellSpeed: 1,
      kind: "trigger",
      search: { count: 1, source: "deck", sources: ["deck"], dest: "hand", quotedNames: [], archetypes: ["HERO"], exceptNames: [], typeHint: "monster", extraKinds: [], attributes: [], races: [], label: "Add HERO" },
    },
  });
  check("bot accepts own search prompt", Boolean(yes && yes.type === "prompt-yes"), yes?.note);
}

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name, c.detail ?? "");
  }
}
if (fail) {
  console.error(fail, "bot checks failed");
  process.exit(1);
}
console.log(`ok — ${cases.length} bot legality checks`);
