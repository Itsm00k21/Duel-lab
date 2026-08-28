/**
 * Shape C OPT (M-FX / Eternal Soul cid=11672 / DL-2026-08-28-B7).
 *
 * C — "You can only use the following effect of … once per turn"
 *     + "You can activate 1 of these effects; ● … ● …":
 *     one hard OPT on the single choose-1 clause. Do not split ●.
 * A/B from B6 must stay: Drillbeam independent; Assist shared following.
 */
import { reduce } from "../src/lib/game/engine";
import { parseCard } from "../src/lib/rules/psct";
import { cardOptPolicy, effectAlreadyUsed, effectUseScope } from "../src/lib/rules/effectOpt";
import { parseEffectOps } from "../src/lib/rules/effectOps";
import { activationOptions } from "../src/lib/rules/activationWindow";
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
    turn: 3,
    phase: "M1",
    activePlayer: "p2",
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

// TCG Neuron cid=11672 compact print (do not average OCG).
const eternal = card({
  id: 48680970,
  name: "Eternal Soul",
  type: "Trap Card",
  race: "Continuous",
  desc: 'Every "Dark Magician" you control is unaffected by your opponent\'s card effects. If this card is sent from the field to the GY: Special Summon as many "Dark Magician" as possible from your GY. You can only use the following effect of "Eternal Soul" once per turn. You can activate 1 of these effects;●Special Summon 1 "Dark Magician" from your hand or GY.●Add 1 "Dark Magic Attack" or "Thousand Knives" from your Deck to your hand.',
});

const assist = card({
  id: 86762958,
  name: "Assist★Yummy!",
  type: "Effect Monster",
  desc: 'If you control a "Yummy" monster: You can Special Summon this card from your hand. During your Standby Phase: You can send 1 "Yummy" card from your Deck to the GY, except "Assist★Yummy!". You can only use 1 of the following effects of "Assist★Yummy!" per turn, and only once that turn.\n● If this card is in the GY: You can target 1 "Yummy" monster you control; return it to the hand.\n● If this card is banished: You can add 1 "Yummy" card from your Deck to your hand, except "Assist★Yummy!".',
});

const drill = card({
  id: 29095457,
  name: "Primite Drillbeam",
  type: "Spell Card",
  race: "Quick-Play",
  desc: 'Reveal 1 "Primite" card, or 1 Normal Monster, in your hand, except "Primite Drillbeam" (or if you control a Normal Monster or a Level 5 or higher "Primite" monster, except a Token, you can activate this effect without revealing a card), then target 1 face-up card on the field; negate its effects, and if you do, banish it. During your Main Phase, if you control a "Primite" monster: You can Set this card from your GY. You can only use each effect of "Primite Drillbeam" once per turn.',
});

const esPol = cardOptPolicy(eternal);
check("C Eternal Soul chooseOne", esPol.chooseOne);
check("C Eternal Soul is not eachEffect / oneOfFollowing", !esPol.eachEffect && !esPol.oneOfFollowing);

const esClauses = parseCard(eternal);
const choiceIdx = esClauses.findIndex((c) => /activate 1 of these effects/i.test(c.raw));
const gySent = esClauses.findIndex((c) => /sent from the field to the gy/i.test(c.raw));
const bulletOnly = esClauses.filter((c) => /^●/.test(c.raw.trim()));
check("C parses one choose-1 clause (both bullets stay in it)", choiceIdx >= 0 && /●/.test(esClauses[choiceIdx]!.raw) && /●.*●/s.test(esClauses[choiceIdx]!.raw) && bulletOnly.length === 0);
check("C choose-1 clause is hard", choiceIdx >= 0 && effectUseScope(eternal, esClauses[choiceIdx]!, choiceIdx) === "hard");
check(
  "C GY-sent trigger is not the choose-1 lock",
  gySent >= 0 && gySent !== choiceIdx && effectUseScope(eternal, esClauses[gySent]!, gySent) !== "hard",
);

const choiceOps = parseEffectOps(esClauses[choiceIdx]!.raw);
check("C parseEffectOps is one choice op", choiceOps.length === 1 && choiceOps[0]?.kind === "choice");
check(
  "C choice stays two bullets as options, not two ops",
  choiceOps[0]?.kind === "choice" && choiceOps[0].options.length === 2,
);

const byId = new Map([[eternal.id, eternal]]);
let s = state();
s.players.p1.spells[0] = z(eternal.id, true);
const menu = activationOptions(s, eternal, s.players.p1.spells[0]!, "st", "p1", byId);
const effectLines = menu.filter((o) => o.mode === "effect");
check("C menu is one choose-1 line", effectLines.length === 1 && effectLines[0]!.clauseIndex === choiceIdx);
check(
  "C menu does not list bullets as separate activations",
  !effectLines.some((o) => /^●/.test((o.menuLabel + o.summary).trim())),
);

s = mark(s, eternal, choiceIdx);
check("C MARK_EFFECT choose-1 → alreadyUsed", used(s, eternal, choiceIdx));
check("C MARK_EFFECT choose-1 → GY-sent still free", gySent < 0 || !used(s, eternal, gySent));
const menuAfter = activationOptions(s, eternal, s.players.p1.spells[0]!, "st", "p1", byId);
check(
  "C used choose-1 hidden for the rest of the turn",
  !menuAfter.some((o) => o.mode === "effect" && o.clauseIndex === choiceIdx),
);

const drillPol = cardOptPolicy(drill);
check("A Drillbeam still eachEffect, not chooseOne", drillPol.eachEffect && !drillPol.chooseOne && !drillPol.oneOfFollowing);
const drillClauses = parseCard(drill);
const qp = drillClauses.findIndex((c) => /negate its effects/i.test(c.raw));
const gy = drillClauses.findIndex((c) => /set this card from your gy/i.test(c.raw));
s = state();
s = mark(s, drill, qp);
check("A MARK_EFFECT QP → GY still free", qp >= 0 && gy >= 0 && used(s, drill, qp) && !used(s, drill, gy));

const assistPol = cardOptPolicy(assist);
check("B Assist still oneOfFollowing, not chooseOne", assistPol.oneOfFollowing && !assistPol.chooseOne && !assistPol.eachEffect);
const assistClauses = parseCard(assist);
const followA = assistClauses.findIndex((c) => /if this card is in the gy/i.test(c.raw));
const followB = assistClauses.findIndex((c) => /if this card is banished/i.test(c.raw));
s = state();
s = mark(s, assist, followA);
check("B MARK_EFFECT follow-A → follow-B alreadyUsed", followA >= 0 && followB >= 0 && used(s, assist, followA) && used(s, assist, followB));

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "opt shape C failure(s)");
  process.exit(1);
}
console.log(`ok — ${cases.length} shape C OPT checks`);
