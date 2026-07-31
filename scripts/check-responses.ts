import { activationOptions } from "../src/lib/rules/activationWindow";
import { findTriggerPrompts } from "../src/lib/rules/triggers";
import { parseResponseGate, evaluateResponse } from "../src/lib/rules/responseGate";
import { profileCardActivation, parseIncludesFromText } from "../src/lib/rules/effectProfile";
import { parseCard } from "../src/lib/rules/psct";
import { collectLegalResponses } from "../src/lib/rules/legalResponses";
import { pickCardActivationClause, cardActivationLabel } from "../src/lib/rules/cardActivationClause";
import { EMPTY_CHAIN } from "../src/lib/rules/chain";
import type { CompactCard } from "../src/lib/cards/types";
import type { GameState, PlayerId, ZoneCard } from "../src/lib/game/types";

function card(partial: Partial<CompactCard> & { name: string; desc: string; type?: string }): CompactCard {
  return {
    id: partial.id ?? Math.floor(Math.random() * 1e7),
    name: partial.name,
    type: partial.type ?? "Effect Monster",
    frameType: "effect",
    desc: partial.desc,
    race: partial.race,
  };
}
function zc(id: number): ZoneCard {
  return { instanceId: `i${id}`, cardId: id, faceUp: true, position: "atk", counters: 0, overlay: [] };
}
function emptyP(id: PlayerId) {
  return {
    id,
    name: id.toUpperCase(),
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

const ash = card({
  id: 14558127,
  name: "Ash Blossom & Joyous Spring",
  desc: 'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate that effect.\n● Add a card from the Deck to the hand.\n● Special Summon from the Deck.\n● Send a card from the Deck to the GY.\nYou can only use this effect of "Ash Blossom & Joyous Spring" once per turn.',
});
const belle = card({
  id: 73642296,
  name: "Ghost Belle & Haunted Mansion",
  desc: 'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card from your hand; negate that activation.\n● Add a card(s) from the GY to the hand, Deck, or Extra Deck.\n● Special Summon a Monster Card(s) from the GY.\n● Banish a card(s) from the GY.\nYou can only use this effect of "Ghost Belle & Haunted Mansion" once per turn.',
});
const imperm = card({
  id: 10045474,
  name: "Infinite Impermanence",
  type: "Trap Card",
  desc: "Target 1 face-up monster your opponent controls; negate its effects until the end of this turn. If this card was Set before activation and is on the field at resolution, for the rest of this turn all other Spell/Trap effects in this column are negated. If you control no cards, you can activate this card from your hand.",
});
const reborn = card({
  id: 83764718,
  name: "Monster Reborn",
  type: "Spell Card",
  desc: "Target 1 monster in either GY; Special Summon it.",
});
const called = card({
  id: 24224830,
  name: "Called by the Grave",
  type: "Spell Card",
  race: "Quick-Play",
  desc: "Target 1 monster in your opponent's GY; banish it, and if you do, until the end of the next turn, its effects are negated, as well as the activated effects and effects on the field of monsters with the same original name.",
});
const foolish = card({
  id: 81439173,
  name: "Foolish Burial",
  type: "Spell Card",
  desc: "Send 1 monster from your Deck to the GY.",
});
const lode = card({
  id: 56506740,
  name: "Primite Lordly Lode",
  type: "Spell Card",
  race: "Continuous",
  desc: 'When this card is activated: Add 1 "Primite" card from your Deck to your hand, except "Primite Lordly Lode". You can declare 1 Normal Monster Card name; Special Summon 1 declared Normal Monster from your hand, Deck, or GY in Defense Position, also you cannot activate the effects of Special Summoned monsters on the field this turn. You can only use each effect of "Primite Lordly Lode" once per turn. Normal Monsters and "Primite" monsters you control gain 300 ATK for each Normal Monster with different names in your GY.',
});

const cases: Array<{ name: string; ok: boolean }> = [];
function check(name: string, cond: boolean) {
  cases.push({ name, ok: cond });
}

const belleGate = parseResponseGate(belle, parseCard(belle)[0]!);
const ashGate = parseResponseGate(ash, parseCard(ash)[0]!);
check("Belle gate has gy includes", Boolean(belleGate && belleGate.includes.includes("ss-gy") && belleGate.includes.includes("banish-gy") && belleGate.includes.includes("add-gy-hand")));
check("Ash gate has deck includes", Boolean(ashGate && ashGate.includes.includes("add-deck-hand") && ashGate.includes.includes("ss-deck") && ashGate.includes.includes("send-deck-gy")));

check("Imperm profile no gy/deck search", !profileCardActivation(imperm).includes.some((i) => i.startsWith("add-") || i.startsWith("ss-") || i === "banish-gy" || i === "send-deck-gy"));
check("Imperm profile negate", profileCardActivation(imperm).includes.includes("negate-effect"));
check("Reborn is ss-gy", profileCardActivation(reborn).includes.includes("ss-gy"));
check("Called by is banish-gy", profileCardActivation(called).includes.includes("banish-gy"));
check("Foolish is send-deck-gy", profileCardActivation(foolish).includes.includes("send-deck-gy"));
check("Lode activation is add-deck only", profileCardActivation(lode).includes.includes("add-deck-hand") && !profileCardActivation(lode).includes.includes("ss-gy"));

const impermLink = {
  id: "1",
  link: 1,
  player: "p2" as const,
  cardId: imperm.id,
  cardName: imperm.name,
  spellSpeed: 2 as const,
  kind: "trap",
  label: "Imperm",
  clauseIndex: -1,
};
check(
  "Belle vs Imperm illegal",
  evaluateResponse(belle, parseCard(belle)[0]!, impermLink, imperm, "p1").ok === false,
);
check(
  "Ash vs Imperm illegal",
  evaluateResponse(ash, parseCard(ash)[0]!, impermLink, imperm, "p1").ok === false,
);
const rebornLink = { ...impermLink, cardId: reborn.id, cardName: reborn.name, spellSpeed: 1 as const, kind: "spell", label: "Reborn" };
check("Belle vs Reborn legal", evaluateResponse(belle, parseCard(belle)[0]!, rebornLink, reborn, "p1").ok === true);
check("Ash vs Reborn illegal", evaluateResponse(ash, parseCard(ash)[0]!, rebornLink, reborn, "p1").ok === false);
const foolishLink = { ...impermLink, cardId: foolish.id, cardName: foolish.name, spellSpeed: 1 as const, kind: "spell", label: "Foolish" };
check("Ash vs Foolish legal", evaluateResponse(ash, parseCard(ash)[0]!, foolishLink, foolish, "p1").ok === true);
check("Belle vs Foolish illegal", evaluateResponse(belle, parseCard(belle)[0]!, foolishLink, foolish, "p1").ok === false);
const calledLink = { ...impermLink, cardId: called.id, cardName: called.name, kind: "spell", label: "Called by" };
check("Belle vs Called by legal", evaluateResponse(belle, parseCard(belle)[0]!, calledLink, called, "p1").ok === true);
const lodeLink = { ...impermLink, cardId: lode.id, cardName: lode.name, spellSpeed: 1 as const, kind: "spell", label: "Lode", clauseIndex: 0 };
check("Ash vs Lode activation legal", evaluateResponse(ash, parseCard(ash)[0]!, lodeLink, lode, "p1").ok === true);
check("Belle vs Lode activation illegal", evaluateResponse(belle, parseCard(belle)[0]!, lodeLink, lode, "p1").ok === false);

const byId = new Map<number, CompactCard>([
  [ash.id, ash],
  [belle.id, belle],
  [imperm.id, imperm],
  [reborn.id, reborn],
  [called.id, called],
  [foolish.id, foolish],
]);
const s = state({
  fetBox: "D",
  chain: {
    links: [{ ...impermLink, includes: ["target", "negate-effect"], clauseText: imperm.desc }],
    resolved: [],
    pendingPlayer: "p1",
    consecutivePasses: 0,
    complete: false,
  },
});
s.players.p1.hand = [zc(ash.id), zc(belle.id)];
check(
  "activationOptions hides Belle vs Imperm",
  activationOptions(s, belle, s.players.p1.hand[1]!, "hand", "p1", byId).filter((o) => o.mode === "effect").length === 0,
);
check(
  "activationOptions hides Ash vs Imperm",
  activationOptions(s, ash, s.players.p1.hand[0]!, "hand", "p1", byId).filter((o) => o.mode === "effect").length === 0,
);

const s2 = state({
  fetBox: "D",
  chain: {
    links: [{ ...rebornLink, includes: ["ss-gy", "target"], clauseText: reborn.desc }],
    resolved: [],
    pendingPlayer: "p1",
    consecutivePasses: 0,
    complete: false,
  },
});
s2.players.p1.hand = [zc(belle.id)];
check(
  "activationOptions shows Belle vs Reborn",
  activationOptions(s2, belle, s2.players.p1.hand[0]!, "hand", "p1", byId).filter((o) => o.mode === "effect").length > 0,
);

check("bullet parse add gy", parseIncludesFromText("Add a card from the GY to the hand").includes("add-gy-hand"));

const promptState = state({
  fetBox: "D",
  chain: s.chain,
});
promptState.players.p1.hand = [zc(belle.id), zc(ash.id)];
const prompts = findTriggerPrompts(
  promptState,
  byId,
  { type: "activation", player: "p2", controller: "p2", cardId: imperm.id, instanceId: "imp1" },
);
check("no Belle/Ash trigger prompt on Imperm", !prompts.some((p) => p.cardId === belle.id || p.cardId === ash.id));

const gaze = card({
  id: 71466592,
  name: "The Gaze of Timaeus",
  type: "Spell Card",
  race: "Quick-Play",
  desc: 'Target 1 "Dark Magician" or "Dark Magician Girl" in your field or GY; Fusion Summon 1 Fusion Monster from your Extra Deck that mentions that monster as material, but banish it during the End Phase of the next turn. You can only activate 1 "The Gaze of Timaeus" per turn.',
});
const rtm = card({
  id: 6128460,
  name: "Radiant Typhoon Manifestation",
  type: "Spell Card",
  race: "Quick-Play",
  desc: 'If this card is destroyed by the effect of "Mystical Space Typhoon": You can Set this card. Activate 1 of these effects (but you can only use each of these effects of "Radiant Typhoon Manifestation" once per turn);\n● Send 1 "Radiant Typhoon" monster from your Deck to the GY.\n● Add 1 "Mystical Space Typhoon" from your Deck or GY to your hand.',
});
const dm = card({ id: 46986414, name: "Dark Magician", type: "Normal Monster", desc: "Wizard." });
byId.set(gaze.id, gaze);
byId.set(rtm.id, rtm);
byId.set(dm.id, dm);
byId.set(foolish.id, foolish);

const rtmPick = pickCardActivationClause(rtm);
check("RTM activation clause is not MST-destroy", !/destroyed by the effect of/i.test(rtmPick.clause?.condition ?? rtmPick.clause?.raw ?? ""));
check("RTM activation label is not MST-destroy", !/destroyed by the effect of/i.test(cardActivationLabel(rtm)));

const fake = state({
  activePlayer: "p2",
  fetBox: "D",
  chain: {
    links: [{ id: "1", link: 1, player: "p2", cardId: rtm.id, cardName: rtm.name, spellSpeed: 2, kind: "spell", label: cardActivationLabel(rtm) }],
    resolved: [],
    pendingPlayer: "p1",
    consecutivePasses: 0,
    complete: false,
  },
});
fake.players.p1.hand = [zc(gaze.id), zc(imperm.id), zc(foolish.id)];
check(
  "legalResponses hides Gaze+Imperm+Foolish vs RTM (no targets / normal spell)",
  collectLegalResponses(fake, "p1", byId).length === 0,
);
fake.players.p1.hand = [zc(ash.id), zc(gaze.id), zc(imperm.id)];
fake.chain.links[0] = {
  ...fake.chain.links[0]!,
  includes: ["send-deck-gy", "add-deck-hand"],
  clauseText: rtm.desc,
};
const rtmRows = collectLegalResponses(fake, "p1", byId);
check("Ash legal vs RTM activation bullets", rtmRows.some((r) => r.data.id === ash.id));
check("Gaze still hidden vs RTM", !rtmRows.some((r) => r.data.id === gaze.id));
check("Imperm still hidden vs RTM without opp monster", !rtmRows.some((r) => r.data.id === imperm.id));

const ashOk = state({
  activePlayer: "p1",
  fetBox: "D",
  chain: {
    links: [
      {
        id: "1",
        link: 1,
        player: "p2",
        cardId: foolish.id,
        cardName: foolish.name,
        spellSpeed: 1,
        kind: "spell",
        label: "mill",
        includes: ["send-deck-gy"],
        clauseText: foolish.desc,
      },
    ],
    resolved: [],
    pendingPlayer: "p1",
    consecutivePasses: 0,
    complete: false,
  },
});
ashOk.players.p1.hand = [zc(ash.id), zc(gaze.id), zc(foolish.id)];
const ashRows = collectLegalResponses(ashOk, "p1", byId);
check("Ash offered vs Foolish", ashRows.some((r) => r.data.id === ash.id));
check("Gaze not offered vs Foolish without DM", !ashRows.some((r) => r.data.id === gaze.id));
check("Normal Spell Foolish not offered as chain from hand", !ashRows.some((r) => r.data.id === foolish.id));

const selfImp = state({
  activePlayer: "p1",
  fetBox: "D",
  chain: {
    links: [
      {
        id: "1",
        link: 1,
        player: "p1",
        cardId: imperm.id,
        cardName: imperm.name,
        instanceId: "imp-self",
        spellSpeed: 2,
        kind: "trap",
        label: "Imperm",
        includes: ["target", "negate-effect"],
        clauseText: imperm.desc,
      },
    ],
    resolved: [],
    pendingPlayer: "p1",
    consecutivePasses: 0,
    complete: false,
  },
});
selfImp.players.p2.monsters[0] = zc(46986414);
selfImp.players.p1.spells[0] = { instanceId: "imp-self", cardId: imperm.id, faceUp: true, position: "atk", counters: 0, overlay: [] };
check(
  "own face-up Imperm on chain is not a legal self-response",
  collectLegalResponses(selfImp, "p1", byId).length === 0,
);

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "response checks failed");
  process.exit(1);
}
console.log(`ok — ${cases.length} response / include checks`);
