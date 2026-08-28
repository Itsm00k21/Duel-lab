/**
 * Shape B vs A OPT (M-FX / Assist cid=22178 / DL-2026-08-28-B6).
 *
 * B — "You can only use 1 of the following effects of … per turn":
 *     one shared hard OPT across the following clauses.
 * A — "You can only use each effect of … once per turn":
 *     independent hard OPTs per clauseIndex (Drillbeam).
 */
import { reduce } from "../src/lib/game/engine";
import { parseCard } from "../src/lib/rules/psct";
import { cardOptPolicy, effectAlreadyUsed, effectUseScope } from "../src/lib/rules/effectOpt";
import { EMPTY_CHAIN } from "../src/lib/rules/chain";
import type { CompactCard } from "../src/lib/cards/types";
import type { GameState, PlayerId, ZoneCard } from "../src/lib/game/types";

function card(p: Partial<CompactCard> & { name: string; desc: string; type?: string }): CompactCard {
  return { id: p.id ?? Math.floor(Math.random() * 1e7), type: p.type ?? "Effect Monster", frameType: "effect", ...p };
}
function z(id: number, faceUp = true): ZoneCard {
  return { instanceId: `i${id}`, cardId: id, faceUp, position: "atk", counters: 0, overlay: [] };
}
function emptyP(id: PlayerId) {
  return {
    id,
    name: id,
    lp: 8000,
    deck: [] as ZoneCard[],
    hand: [] as ZoneCard[],
    gy: [] as ZoneCard[],
    banish: [] as ZoneCard[],
    extra: [] as ZoneCard[],
    side: [] as ZoneCard[],
    monsters: [null, null, null, null, null] as Array<ZoneCard | null>,
    spells: [null, null, null, null, null] as Array<ZoneCard | null>,
    field: null,
  };
}
function state(over: Partial<GameState> = {}): GameState {
  return {
    id: "t",
    formatId: "advanced",
    turn: 1,
    phase: "M1",
    activePlayer: "p1",
    players: { p1: emptyP("p1"), p2: emptyP("p2") },
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
    ...over,
  } as GameState;
}

const cases: Array<{ name: string; ok: boolean }> = [];
function check(name: string, cond: boolean) {
  cases.push({ name, ok: cond });
}

function mark(s: GameState, c: CompactCard, clauseIndex: number, scope: "hard" | "soft" = "hard"): GameState {
  return reduce(s, {
    type: "MARK_EFFECT",
    player: "p1",
    cardId: c.id,
    cardName: c.name,
    clauseIndex,
    instanceId: `i${c.id}`,
    scope,
  });
}

function used(s: GameState, c: CompactCard, clauseIndex: number): boolean {
  const clause = parseCard(c)[clauseIndex] ?? null;
  return effectAlreadyUsed(s, "p1", c, z(c.id), clauseIndex, clause);
}

// Assist cid=22178 — scoped shape B (TCG "1 of the following").
const assist = card({
  id: 86762958,
  name: "Assist★Yummy!",
  type: "Effect Monster",
  desc: 'If you control a "Yummy" monster: You can Special Summon this card from your hand. During your Standby Phase: You can send 1 "Yummy" card from your Deck to the GY, except "Assist★Yummy!". You can only use 1 of the following effects of "Assist★Yummy!" per turn, and only once that turn.\n● If this card is in the GY: You can target 1 "Yummy" monster you control; return it to the hand.\n● If this card is banished: You can add 1 "Yummy" card from your Deck to your hand, except "Assist★Yummy!".',
});

// Drillbeam cid=20536 — shape A (each effect once).
const drill = card({
  id: 29095457,
  name: "Primite Drillbeam",
  type: "Spell Card",
  race: "Quick-Play",
  desc: 'Reveal 1 "Primite" card, or 1 Normal Monster, in your hand, except "Primite Drillbeam" (or if you control a Normal Monster or a Level 5 or higher "Primite" monster, except a Token, you can activate this effect without revealing a card), then target 1 face-up card on the field; negate its effects, and if you do, banish it. During your Main Phase, if you control a "Primite" monster: You can Set this card from your GY. You can only use each effect of "Primite Drillbeam" once per turn.',
});

const beryl = card({
  id: 63198739,
  name: "Primite Dragon Ether Beryl",
  desc: 'If this card is Normal Summoned: You can Set 1 "Primite" Spell/Trap from your Deck. You can only use each of the following effects of "Primite Dragon Ether Beryl" once per turn. You can Tribute this card; send 1 Normal Monster from your Deck to the GY. During your Standby Phase, if you have a Normal Monster in your field or GY: You can add this card from the GY to your hand.',
});

const eternal = card({
  id: 48680970,
  name: "Eternal Soul",
  type: "Trap Card",
  race: "Continuous",
  desc: 'Every "Dark Magician" you control is unaffected by your opponent\'s card effects. If this card is sent from the field to the GY: Special Summon as many "Dark Magician" as possible from your GY. You can activate 1 of these effects;\n● Special Summon 1 "Dark Magician" from your hand or GY.\n● Add 1 "Dark Magician" or 1 card that mentions it from your Deck to your hand, except "Eternal Soul".\nYou can only use 1 "Eternal Soul" effect per turn, and only once that turn.',
});

const assistPol = cardOptPolicy(assist);
check("B Assist oneOfFollowing", assistPol.oneOfFollowing);
check("B Assist is not eachEffect", !assistPol.eachEffect);
check("B Assist is not followingOnly", !assistPol.followingOnly);

const assistClauses = parseCard(assist);
const assistReminder = assistClauses.findIndex((c) => /^you can only use 1 of the following/i.test(c.raw));
const followA = assistClauses.findIndex((c) => /if this card is in the gy/i.test(c.raw));
const followB = assistClauses.findIndex((c) => /if this card is banished/i.test(c.raw));
const standby = assistClauses.findIndex((c) => /standby phase/i.test(c.raw));
check("B Assist parses reminder then two following clauses", assistReminder >= 0 && followA > assistReminder && followB > assistReminder && followA !== followB);
check(
  "B Assist following clauses are hard",
  followA >= 0 &&
    followB >= 0 &&
    effectUseScope(assist, assistClauses[followA]!, followA) === "hard" &&
    effectUseScope(assist, assistClauses[followB]!, followB) === "hard",
);
check(
  "B Assist Standby is not in the shared following lock",
  standby >= 0 && effectUseScope(assist, assistClauses[standby]!, standby) !== "hard",
);

let s = state();
s = mark(s, assist, followA);
check("B MARK_EFFECT clause A → clause A alreadyUsed", used(s, assist, followA));
check("B MARK_EFFECT clause A → clause B alreadyUsed", used(s, assist, followB));
check("B MARK_EFFECT clause A → Standby still free", standby < 0 || !used(s, assist, standby));

const drillPol = cardOptPolicy(drill);
check("A Drillbeam eachEffect", drillPol.eachEffect);
check("A Drillbeam is not oneOfFollowing", !drillPol.oneOfFollowing);
check("A Drillbeam is not followingOnly", !drillPol.followingOnly);

const drillClauses = parseCard(drill);
const qp = drillClauses.findIndex((c) => /negate its effects/i.test(c.raw));
const gy = drillClauses.findIndex((c) => /set this card from your gy/i.test(c.raw));
check("A Drillbeam parses QP and GY clauses", qp >= 0 && gy >= 0 && qp !== gy);
check(
  "A Drillbeam both clauses independently hard",
  effectUseScope(drill, drillClauses[qp]!, qp) === "hard" && effectUseScope(drill, drillClauses[gy]!, gy) === "hard",
);

s = state();
s = mark(s, drill, qp);
check("A MARK_EFFECT QP → QP alreadyUsed", used(s, drill, qp));
check("A MARK_EFFECT QP → GY still free", !used(s, drill, gy));

s = mark(s, drill, gy);
check("A MARK_EFFECT GY after QP → GY now used", used(s, drill, gy));

const berylPol = cardOptPolicy(beryl);
check("A′ Beryl followingOnly stays eachEffect, not oneOfFollowing", berylPol.followingOnly && berylPol.eachEffect && !berylPol.oneOfFollowing);
const berylClauses = parseCard(beryl);
const trib = berylClauses.findIndex((c) => /tribute this card/i.test(c.raw));
const recycle = berylClauses.findIndex((c) => /add this card from the gy/i.test(c.raw));
s = state();
s = mark(s, beryl, trib);
check("A′ Beryl tribute used → GY recycle still free", trib >= 0 && recycle >= 0 && used(s, beryl, trib) && !used(s, beryl, recycle));

const esPol = cardOptPolicy(eternal);
check("C Eternal Soul is not oneOfFollowing or eachEffect", !esPol.oneOfFollowing && !esPol.eachEffect);

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "opt shape B failure(s)");
  process.exit(1);
}
console.log(`ok — ${cases.length} shape A/B OPT checks`);
