import { activationOptions } from "../src/lib/rules/activationWindow";
import { parseCard } from "../src/lib/rules/psct";
import type { CompactCard } from "../src/lib/cards/types";
import type { GameState, PlayerId, ZoneCard } from "../src/lib/game/types";
import { EMPTY_CHAIN } from "../src/lib/rules/chain";

function card(partial: Partial<CompactCard> & { name: string; desc: string; type?: string }): CompactCard {
  return {
    id: partial.id ?? Math.floor(Math.random() * 100000),
    name: partial.name,
    type: partial.type ?? "Effect Monster",
    frameType: "effect",
    desc: partial.desc,
  };
}

function zone(cardId: number, faceUp = true): ZoneCard {
  return { instanceId: `i${cardId}`, cardId, faceUp, position: "atk", counters: 0, overlay: [] };
}

function baseState(over: Partial<GameState> = {}): GameState {
  const emptyP = (id: PlayerId, name: string) => ({
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
    field: null,
  });
  return {
    id: "t",
    formatId: "advanced",
    turn: 1,
    phase: "M1",
    activePlayer: "p1",
    players: { p1: emptyP("p1", "P1"), p2: emptyP("p2", "P2") },
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
const veiler = card({
  id: 97268402,
  name: "Effect Veiler",
  desc: "During your opponent's Main Phase (Quick Effect): You can send this card from your hand to the GY, then target 1 Effect Monster your opponent controls; negate the effects of that face-up monster your opponent controls, until the end of this turn.",
});
const dm = card({
  id: 46986414,
  name: "Dark Magician",
  type: "Normal Monster",
  desc: "''The ultimate wizard in terms of attack and defense.''",
});
const lonefire = card({
  id: 48686504,
  name: "Lonefire Blossom",
  desc: "Once per turn: You can Tribute 1 face-up Plant monster; Special Summon 1 Plant monster from your Deck.",
});
const lode = card({
  id: 56506740,
  name: "Primite Lordly Lode",
  type: "Spell Card",
  desc: 'When this card is activated: Add 1 "Primite" card from your Deck to your hand, except "Primite Lordly Lode". You can declare 1 Normal Monster Card name; Special Summon 1 declared Normal Monster from your hand, Deck, or GY in Defense Position, also you cannot activate the effects of Special Summoned monsters on the field this turn. You can only use each effect of "Primite Lordly Lode" once per turn. Normal Monsters and "Primite" monsters you control gain 300 ATK for each Normal Monster with different names in your GY.',
});
if ("race" in lode) {
  /* keep */
}
(lode as CompactCard).race = "Continuous";
const stratos = card({
  id: 40044918,
  name: "Elemental HERO Stratos",
  desc: "When this card is Normal or Special Summoned: You can activate 1 of these effects.\n● Add 1 \"HERO\" monster from your Deck to your hand.",
});
const reborn = card({
  id: 83764718,
  name: "Monster Reborn",
  type: "Spell Card",
  desc: "Target 1 monster in either GY; Special Summon it.",
});
const nibiru = card({
  id: 27204311,
  name: "Nibiru, the Primal Being",
  desc: "During the Main Phase, if your opponent Normal or Special Summoned 5 or more monsters this turn (Quick Effect): You can Tribute as many face-up monsters on the field as possible, and if you do, Special Summon this card from your hand.",
});
const imperm = card({
  id: 10045474,
  name: "Infinite Impermanence",
  type: "Trap Card",
  desc: "Target 1 face-up monster your opponent controls; negate its effects until the end of this turn. If this card was Set before activation and is on the field at resolution, for the rest of this turn all other Spell/Trap effects in this column are negated. If you control no cards, you can activate this card from your hand.",
});
const belle = card({
  id: 73642296,
  name: "Ghost Belle & Haunted Mansion",
  desc: 'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card from your hand; negate that activation.\n● Add a card(s) from the GY to the hand, Deck, or Extra Deck.\n● Special Summon a Monster Card(s) from the GY.\n● Banish a card(s) from the GY.\nYou can only use this effect of "Ghost Belle & Haunted Mansion" once per turn.',
});

function fx(state: GameState, c: CompactCard, loc: "hand" | "field" | "st" | "gy", owner: PlayerId = "p1", faceUp = true) {
  const zc = zone(c.id, faceUp);
  if (loc === "field") state.players[owner].monsters[0] = state.players[owner].monsters[0] ?? zc;
  if (loc === "st") state.players[owner].spells[0] = state.players[owner].spells[0] ?? zc;
  if (loc === "hand") state.players[owner].hand = state.players[owner].hand.length ? state.players[owner].hand : [zc];
  if (loc === "gy") state.players[owner].gy = state.players[owner].gy.some((x) => x.instanceId === zc.instanceId) ? state.players[owner].gy : [zc, ...state.players[owner].gy];
  return activationOptions(state, c, loc === "field" ? state.players[owner].monsters[0]! : loc === "st" ? state.players[owner].spells[0]! : loc === "hand" ? state.players[owner].hand[0]! : state.players[owner].gy[0]!, loc, owner).filter((o) => o.mode === "effect");
}
function cardAct(state: GameState, c: CompactCard, loc: "hand" | "st", owner: PlayerId = "p1", faceUp = true) {
  return activationOptions(state, c, zone(c.id, faceUp), loc, owner).filter((o) => o.mode === "card");
}

const cases: Array<{ name: string; got: boolean; expect: boolean }> = [];
function check(name: string, got: boolean, expect: boolean) {
  cases.push({ name, got, expect });
}

const mp = baseState({ phase: "M1", activePlayer: "p1", fetBox: "A" });
const oppMp = baseState({ phase: "M1", activePlayer: "p2", fetBox: "A" });
const dp = baseState({ phase: "DP", activePlayer: "p1", fetBox: "A" });
const chained = baseState({
  phase: "M1",
  activePlayer: "p1",
  fetBox: "D",
  chain: {
    links: [
      {
        id: "c1",
        link: 1,
        player: "p1",
        cardId: 1,
        cardName: "Foolish Burial",
        spellSpeed: 1,
        kind: "spell",
        label: "act",
        clauseText: "Send 1 monster from your Deck to the GY.",
        includes: ["send-deck-gy"],
      },
    ],
    resolved: [],
    pendingPlayer: "p2",
    consecutivePasses: 0,
    complete: false,
  },
});
const yellow = baseState({
  phase: "M1",
  activePlayer: "p1",
  fetBox: "yellow",
  lastEvent: { type: "summon", player: "p1", controller: "p1", cardId: stratos.id, summonKind: "normal" },
});
const five = baseState({ phase: "M1", activePlayer: "p2", fetBox: "A", summonsThisTurn: { p1: 0, p2: 5 } });

check("DM hand no effect", fx(mp, dm, "hand").length > 0, false);
check("DM field no effect", fx(mp, dm, "field").length > 0, false);
check("Ash hand without chain", fx(mp, ash, "hand").length > 0, false);
check("Ash hand with chain", fx(chained, ash, "hand").length > 0, true);
check("Veiler your MP", fx(mp, veiler, "hand").length > 0, false);
check("Veiler opp MP no target", fx(oppMp, veiler, "hand").length > 0, false);
const oppHasMon = baseState({ phase: "M1", activePlayer: "p2", fetBox: "A" });
oppHasMon.players.p2.monsters[0] = zone(lonefire.id, true);
check(
  "Veiler opp MP with Effect target",
  activationOptions(oppHasMon, veiler, zone(veiler.id), "hand", "p1", new Map([[veiler.id, veiler], [lonefire.id, lonefire]])).filter((o) => o.mode === "effect").length > 0,
  true,
);
const oppNormalOnly = baseState({ phase: "M1", activePlayer: "p2", fetBox: "A" });
oppNormalOnly.players.p2.monsters[0] = zone(dm.id, true);
check("Veiler opp MP Normal only hidden", fx(oppNormalOnly, veiler, "hand").length > 0, false);
const standbyMon = card({
  id: 9001,
  name: "Standby Searcher",
  desc: "During the Standby Phase: You can add 1 monster from your GY to your hand. You can only use this effect of \"Standby Searcher\" once per turn.",
});
const battleQuick = card({
  id: 9002,
  name: "Battle Quick",
  desc: "During the Battle Phase (Quick Effect): You can target 1 face-up monster on the field; it loses 500 ATK until the end of this turn.",
});
const spPhase = baseState({ phase: "SP", activePlayer: "p1", fetBox: "A" });
const bpPhase = baseState({ phase: "BP", activePlayer: "p1", fetBox: "A" });
check("Standby effect in SP", fx(spPhase, standbyMon, "field").length > 0, true);
check("Standby effect not in MP", fx(mp, standbyMon, "field").length > 0, false);
check("Battle quick in BP", fx(bpPhase, battleQuick, "field").length > 0, true);
check("Battle quick not in MP", fx(mp, battleQuick, "field").length > 0, false);

const beryl = card({
  id: 63198739,
  name: "Primite Dragon Ether Beryl",
  desc: 'If this card is Normal Summoned: You can Set 1 "Primite" Spell/Trap from your Deck. You can only use each of the following effects of "Primite Dragon Ether Beryl" once per turn. You can Tribute this card; send 1 Normal Monster from your Deck to the GY. During your Standby Phase, if you have a Normal Monster in your field or GY: You can add this card from the GY to your hand.',
});
const berylField = baseState({ phase: "M1", activePlayer: "p1", fetBox: "A" });
berylField.players.p1.monsters[0] = zone(beryl.id, true);
const berylOpts = activationOptions(berylField, beryl, berylField.players.p1.monsters[0]!, "field", "p1");
check("Beryl tribute ignition in MP", berylOpts.some((o) => o.mode === "effect" && /tribute this card/i.test(o.menuLabel + o.reason)), true);
check("Beryl no standby recycle in MP on field", !berylOpts.some((o) => /add this card from the gy/i.test(o.menuLabel + o.summary)), true);
const berylYellow = baseState({
  phase: "M1",
  activePlayer: "p1",
  fetBox: "yellow",
  lastEvent: { type: "summon", player: "p1", controller: "p1", cardId: beryl.id, instanceId: `i${beryl.id}`, summonKind: "normal" },
});
berylYellow.players.p1.monsters[0] = zone(beryl.id, true);
const berylYOpts = activationOptions(berylYellow, beryl, berylYellow.players.p1.monsters[0]!, "field", "p1");
check("Beryl NS trigger in yellow", berylYOpts.some((o) => /set 1/i.test(o.menuLabel + o.summary)), true);
check("Beryl tribute still in yellow MP", berylYOpts.some((o) => /tribute this card/i.test(o.menuLabel + o.reason)), true);
check("Beryl no GY recycle in yellow MP", !berylYOpts.some((o) => /add this card from the gy/i.test(o.menuLabel + o.summary)), true);
const berylGySp = baseState({ phase: "SP", activePlayer: "p1", fetBox: "A" });
berylGySp.players.p1.gy = [zone(beryl.id, true)];
berylGySp.players.p1.monsters[0] = zone(dm.id, true);
check(
  "Beryl GY recycle in your SP",
  activationOptions(
    berylGySp,
    beryl,
    berylGySp.players.p1.gy[0]!,
    "gy",
    "p1",
    new Map([
      [beryl.id, beryl],
      [dm.id, dm],
    ]),
  ).some((o) => /add this card/i.test(o.menuLabel + o.summary)),
  true,
);

check("Lonefire field your MP", fx(mp, lonefire, "field").length > 0, true);
check("Lonefire field DP", fx(dp, lonefire, "field").length > 0, false);
check("Lonefire hand", fx(mp, lonefire, "hand").length > 0, false);
check("Stratos field no window", fx(mp, stratos, "field").length > 0, false);
yellow.players.p1.monsters[0] = zone(stratos.id, true);
check("Stratos field yellow", fx(yellow, stratos, "field").length > 0, true);
check("Reborn hand your MP", cardAct(mp, reborn, "hand").length > 0, true);
check("Reborn hand opp turn", cardAct(oppMp, reborn, "hand").length > 0, false);
check("Nibiru before 5", fx(oppMp, nibiru, "hand").length > 0, false);
check("Nibiru after 5 opp MP", fx(five, nibiru, "hand").length > 0, true);

const emptyField = baseState({ phase: "M1", activePlayer: "p2", fetBox: "A" });
emptyField.players.p2.monsters[0] = zone(dm.id, true);
const stuffed = baseState({ phase: "M1", activePlayer: "p2", fetBox: "A" });
stuffed.players.p1.monsters[0] = zone(99);
stuffed.players.p2.monsters[0] = zone(dm.id, true);
const emptyNoTgt = baseState({ phase: "M1", activePlayer: "p2", fetBox: "A" });
check("Imperm hand empty field with target", cardAct(emptyField, imperm, "hand").length > 0, true);
check("Imperm hand empty field no target", cardAct(emptyNoTgt, imperm, "hand").length > 0, false);
check("Imperm hand with board", cardAct(stuffed, imperm, "hand").length > 0, false);

const impermChain = baseState({
  phase: "M1",
  activePlayer: "p1",
  fetBox: "D",
  chain: {
    links: [
      {
        id: "c1",
        link: 1,
        player: "p2",
        cardId: imperm.id,
        cardName: "Infinite Impermanence",
        spellSpeed: 2,
        kind: "trap",
        label: "negate monster",
        clauseText: "Target 1 face-up monster your opponent controls; negate its effects until the end of this turn.",
        includes: ["target", "negate-effect"],
      },
    ],
    resolved: [],
    pendingPlayer: "p1",
    consecutivePasses: 0,
    complete: false,
  },
});
check("Belle cannot respond to Imperm", fx(impermChain, belle, "hand").length > 0, false);
check("Ash cannot respond to Imperm", fx(impermChain, ash, "hand").length > 0, false);
check("Ash can respond to Foolish (deck mill)", fx(chained, ash, "hand").length > 0, true);

const lodeField = baseState({ phase: "M1", activePlayer: "p1", fetBox: "A" });
lodeField.players.p1.spells[0] = zone(lode.id, true);
const lodeFx = activationOptions(lodeField, lode, lodeField.players.p1.spells[0]!, "st", "p1");
check("Lode face-up has SS effect", lodeFx.some((o) => o.mode === "effect" && /special summon/i.test(o.menuLabel + o.summary)), true);
check("Lode face-up no add-again", lodeFx.some((o) => /add 1/i.test(o.menuLabel + o.summary)), false);
check("Lode face-up not 2+ same effects", lodeFx.filter((o) => o.mode === "effect").length === 1, true);

const lodeUsed = baseState({
  phase: "M1",
  activePlayer: "p1",
  fetBox: "A",
  effectsUsedThisTurn: [
    { player: "p1", cardId: lode.id, nameKey: "primitelordlylode", clauseIndex: 1, scope: "hard" },
  ],
});
lodeUsed.players.p1.spells[0] = zone(lode.id, true);
check(
  "Lode SS OPT spent",
  activationOptions(lodeUsed, lode, lodeUsed.players.p1.spells[0]!, "st", "p1").some((o) => o.mode === "effect"),
  false,
);

const lodeYellow = baseState({ phase: "M1", activePlayer: "p1", fetBox: "yellow" });
lodeYellow.players.p1.spells[0] = zone(lode.id, true);
check(
  "Lode yellow does not re-offer activation search",
  activationOptions(lodeYellow, lode, lodeYellow.players.p1.spells[0]!, "st", "p1").some((o) => /add 1/i.test(o.menuLabel + o.summary + o.reason)),
  false,
);

const loneUsed = baseState({
  phase: "M1",
  activePlayer: "p1",
  fetBox: "A",
  effectsUsedThisTurn: [
    { player: "p1", cardId: lonefire.id, nameKey: "lonefireblossom", clauseIndex: 0, instanceId: `i${lonefire.id}`, scope: "soft" },
  ],
});
check("Lonefire soft OPT spent", fx(loneUsed, lonefire, "field").length > 0, false);

const lodeSet = baseState({ phase: "M1", activePlayer: "p1", fetBox: "yellow", turn: 1 });
lodeSet.players.p1.spells[0] = { ...zone(lode.id, false), setTurn: 1 };
check(
  "Lode Set this turn can activate",
  activationOptions(lodeSet, lode, lodeSet.players.p1.spells[0]!, "st", "p1").some((o) => o.mode === "card"),
  true,
);

const lodeSetLater = baseState({ phase: "M1", activePlayer: "p1", fetBox: "A", turn: 2 });
lodeSetLater.players.p1.spells[0] = { ...zone(lode.id, false), setTurn: 1 };
check(
  "Lode Set last turn can activate",
  activationOptions(lodeSetLater, lode, lodeSetLater.players.p1.spells[0]!, "st", "p1").some((o) => o.mode === "card"),
  true,
);

const drill = card({
  id: 19510093,
  name: "Primite Drillbeam",
  type: "Spell Card",
  desc: 'Reveal 1 "Primite" card, except "Primite Drillbeam", or 1 Normal Monster in your hand; ...',
});
(drill as CompactCard).race = "Quick-Play";
const drillSet = baseState({ phase: "M1", activePlayer: "p1", fetBox: "A", turn: 1 });
drillSet.players.p1.spells[0] = { ...zone(drill.id, false), setTurn: 1 };
check(
  "QP Set this turn cannot activate",
  activationOptions(drillSet, drill, drillSet.players.p1.spells[0]!, "st", "p1").some((o) => o.mode === "card"),
  false,
);
const drillNext = baseState({ phase: "M1", activePlayer: "p2", fetBox: "A", turn: 2 });
drillNext.players.p1.spells[0] = { ...zone(drill.id, false), setTurn: 1 };
check(
  "QP Set last turn can activate on either turn",
  activationOptions(drillNext, drill, drillNext.players.p1.spells[0]!, "st", "p1").some((o) => o.mode === "card"),
  true,
);

const impermSet = baseState({ phase: "M1", activePlayer: "p1", fetBox: "A", turn: 1 });
impermSet.players.p1.spells[0] = { ...zone(imperm.id, false), setTurn: 1 };
check(
  "Trap Set this turn cannot activate",
  activationOptions(impermSet, imperm, impermSet.players.p1.spells[0]!, "st", "p1").some((o) => o.mode === "card"),
  false,
);

const deception = card({
  id: 66328392,
  name: "Deception of the Sinful Spoils",
  type: "Spell Card",
  desc: 'You can Tribute 1 monster from your hand or field; add 1 "Azamina" card from your Deck to your hand. If a monster(s) is sent to your opponent\'s GY, and you control an "Azamina" monster (except during the Damage Step): You can make your opponent lose 1500 LP, and if you do, gain 1500 LP. During the End Phase, if this card is in the GY because it was sent there from the Spell & Trap Zone this turn while face-up: You can Set it. You can only use each effect of "Deception of the Sinful Spoils" once per turn.',
});
(deception as CompactCard).race = "Continuous";
const decSet = baseState({ phase: "M1", activePlayer: "p1", fetBox: "yellow", turn: 1 });
decSet.players.p1.spells[0] = { ...zone(deception.id, false), setTurn: 1 };
const decOpts = activationOptions(decSet, deception, decSet.players.p1.spells[0]!, "st", "p1");
check("Deception Set this turn can flip-activate", decOpts.some((o) => o.mode === "card"), true);
check(
  "Deception face-down does not offer tribute ignition or GY trigger",
  !decOpts.some((o) => o.mode === "effect"),
  true,
);
const decUp = baseState({ phase: "M1", activePlayer: "p1", fetBox: "A", turn: 1 });
decUp.players.p1.spells[0] = zone(deception.id, true);
decUp.players.p1.monsters[0] = zone(1, true);
check(
  "Deception face-up offers tribute search",
  activationOptions(decUp, deception, decUp.players.p1.spells[0]!, "st", "p1").some(
    (o) => o.mode === "effect" && /azamina|tribute/i.test(o.menuLabel + o.summary + o.reason),
  ),
  true,
);

// sanity: Ash classified quick
if (!parseCard(ash).some((c) => c.kind === "quick" && c.fromHand)) {
  check("Ash PSCT quick/hand", false, true);
} else check("Ash PSCT quick/hand", true, true);

let fail = 0;
for (const c of cases) {
  if (c.got !== c.expect) {
    fail += 1;
    console.error("FAIL", c.name, "got", c.got, "expected", c.expect);
  }
}
if (fail) {
  console.error(fail, "activation window failure(s)");
  process.exit(1);
}
console.log(`ok — ${cases.length} activation window checks`);
