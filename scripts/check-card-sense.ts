import { parseCard } from "../src/lib/rules/psct";
import { activationOptions } from "../src/lib/rules/activationWindow";
import { senseClause } from "../src/lib/rules/cardSense";
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
    id, name: id, lp: 8000, deck: [] as ZoneCard[], hand: [] as ZoneCard[], gy: [] as ZoneCard[], banish: [] as ZoneCard[],
    extra: [] as ZoneCard[], side: [] as ZoneCard[], monsters: [null, null, null, null, null] as Array<ZoneCard | null>,
    spells: [null, null, null, null, null] as Array<ZoneCard | null>, field: null,
  };
}
function state(over: Partial<GameState> = {}): GameState {
  return {
    id: "t", formatId: "advanced", turn: 1, phase: "M1", activePlayer: "p1",
    players: { p1: emptyP("p1"), p2: emptyP("p2") }, emz: [null, null], log: [], notes: "", view: "god",
    chain: structuredClone(EMPTY_CHAIN), fetBox: "A", summonsThisTurn: { p1: 0, p2: 0 },
    normalSummonUsed: { p1: false, p2: false }, bonusNormalSummons: { p1: 0, p2: 0 }, effectsUsedThisTurn: [],
    activatedSpellThisTurn: false, startingPlayer: "p1", drewThisTurn: { p1: false, p2: false }, attackedThisTurn: [],
    createdAt: "", updatedAt: "", ...over,
  } as GameState;
}

const cases: Array<{ name: string; ok: boolean }> = [];
function check(name: string, cond: boolean) {
  cases.push({ name, ok: cond });
}

const souls = card({
  id: 97631303,
  name: "Magicians' Souls",
  desc: 'You can send up to 2 Spells/Traps from your hand and/or field to the GY; draw that many cards. If this card is in your hand: You can send 1 Level 6 or higher Spellcaster monster from your Deck to the GY, then send this card to the GY, and if you do, Special Summon 1 "Dark Magician" or 1 "Dark Magician Girl" from your GY. You can only use each effect of "Magicians\' Souls" once per turn.',
});
const beryl = card({
  id: 63198739,
  name: "Primite Dragon Ether Beryl",
  desc: 'If this card is Normal Summoned: You can Set 1 "Primite" Spell/Trap from your Deck. You can only use each of the following effects of "Primite Dragon Ether Beryl" once per turn. You can Tribute this card; send 1 Normal Monster from your Deck to the GY. During your Standby Phase, if you have a Normal Monster in your field or GY: You can add this card from the GY to your hand.',
});
const lode = card({
  id: 23701465,
  name: "Primite Lordly Lode",
  type: "Spell Card",
  race: "Continuous",
  desc: 'When this card is activated: Add 1 "Primite" card from your Deck to your hand, except "Primite Lordly Lode". You can declare 1 Normal Monster Card name; Special Summon 1 declared Normal Monster from your hand, Deck, or GY in Defense Position, also you cannot activate the effects of Special Summoned monsters on the field this turn. You can only use each effect of "Primite Lordly Lode" once per turn.',
});
const deception = card({
  id: 66328392,
  name: "Deception of the Sinful Spoils",
  type: "Spell Card",
  race: "Continuous",
  desc: 'You can Tribute 1 monster from your hand or field; add 1 "Azamina" card from your Deck to your hand. If a monster(s) is sent to your opponent\'s GY, and you control an "Azamina" monster (except during the Damage Step): You can make your opponent lose 1500 LP, and if you do, gain 1500 LP. During the End Phase, if this card is in the GY because it was sent there from the Spell & Trap Zone this turn while face-up: You can Set it. You can only use each effect of "Deception of the Sinful Spoils" once per turn.',
});
const diabell = card({
  id: 72270339,
  name: "Diabellstar the Black Witch",
  desc: 'You can Special Summon this card (from your hand) by sending 1 other card from your hand or field to the GY. You can only Special Summon "Diabellstar the Black Witch" once per turn this way. If this card is Normal or Special Summoned: You can Set 1 "Sinful Spoils" Spell/Trap directly from your Deck. You can only use this effect of "Diabellstar the Black Witch" once per turn.',
});
const rod = card({
  id: 7084129,
  name: "Magician's Rod",
  desc: 'When this card is Normal Summoned: You can add 1 Spell/Trap that mentions "Dark Magician" from your Deck to your hand. During your opponent\'s turn, if you activate a Spell/Trap Card or effect that mentions "Dark Magician" (except during the Damage Step): You can Tribute this card from your hand or field; immediately after this effect resolves, Normal Summon 1 Spellcaster monster.',
});
const wanted = card({
  id: 80845034,
  name: "WANTED: Seeker of Sinful Spoils",
  type: "Spell Card",
  race: "Quick-Play",
  desc: 'Add 1 "Diabellstar" monster from your Deck or GY to your hand. During your Main Phase: You can banish this card from your GY, then target 1 of your "Sinful Spoils" Spells/Traps that is banished or in your GY, except "WANTED: Seeker of Sinful Spoils"; place it on the bottom of the Deck, then draw 1 card. You can only use each effect of "WANTED: Seeker of Sinful Spoils" once per turn.',
});
const searcher = card({
  id: 42,
  name: "Field Searcher",
  desc: 'Once per turn: You can add 1 Spellcaster monster from your Deck to your hand.',
});

const mp = state({ phase: "M1", fetBox: "A" });
mp.players.p1.monsters[0] = z(souls.id);
mp.players.p1.monsters[1] = z(beryl.id);
mp.players.p1.monsters[2] = z(searcher.id);
mp.players.p1.monsters[3] = z(diabell.id);
mp.players.p1.hand = [z(souls.id + 1)];
mp.players.p1.hand[0]!.cardId = souls.id;
mp.players.p1.spells[0] = z(lode.id);
mp.players.p1.spells[1] = z(deception.id);
mp.players.p1.gy = [z(wanted.id)];
mp.players.p1.monsters[0]!.cardId = souls.id;

const byId = new Map<number, CompactCard>([
  [souls.id, souls],
  [beryl.id, beryl],
  [lode.id, lode],
  [deception.id, deception],
  [diabell.id, diabell],
  [rod.id, rod],
  [wanted.id, wanted],
  [searcher.id, searcher],
]);

const soulsField = activationOptions(mp, souls, mp.players.p1.monsters[0]!, "field", "p1", byId);
const soulsHand = activationOptions(mp, souls, mp.players.p1.hand[0]!, "hand", "p1", byId);
const berylField = activationOptions(mp, beryl, mp.players.p1.monsters[1]!, "field", "p1", byId);
const searchField = activationOptions(mp, searcher, mp.players.p1.monsters[2]!, "field", "p1", byId);
const lodeField = activationOptions(mp, lode, mp.players.p1.spells[0]!, "st", "p1", byId);
const decField = activationOptions(mp, deception, mp.players.p1.spells[1]!, "st", "p1", byId);
const wantedGy = activationOptions(mp, wanted, mp.players.p1.gy[0]!, "gy", "p1", byId);
const diaField = activationOptions(mp, diabell, mp.players.p1.monsters[3]!, "field", "p1", byId);

check(
  "Souls field draw (add-to-hand style cost) offered in MP",
  soulsField.some((o) => o.mode === "effect" && /draw/i.test(o.menuLabel + o.summary)),
);
check(
  "Souls hand SS line offered (If this card is in your hand = state, not event)",
  soulsHand.some((o) => o.mode === "effect"),
);
check(
  "Beryl tribute ignition in open MP",
  berylField.some((o) => o.mode === "effect" && /tribute|send 1 normal/i.test(o.menuLabel + o.summary + o.reason)),
);
check("Beryl NS trigger hidden in open MP", !berylField.some((o) => /normal summoned/i.test(o.summary + o.menuLabel)));
check(
  "Field searcher once-per-turn add to hand offered",
  searchField.some((o) => o.mode === "effect"),
);
check(
  "Lode declare SS offered face-up",
  lodeField.some((o) => o.mode === "effect" && /declare|special summon/i.test(o.menuLabel + o.summary)),
);
check(
  "Deception tribute search offered face-up",
  decField.some((o) => o.mode === "effect" && /azamina|tribute/i.test(o.menuLabel + o.summary + o.reason)),
);
check("WANTED GY MP effect offered", wantedGy.some((o) => o.mode === "effect"));
check("Diabellstar on-summon hidden in open MP (event only)", !diaField.some((o) => o.mode === "effect"));

const soulsHandSense = parseCard(souls).map((c) => senseClause(souls, c));
check(
  "sense: Souls hand line is ignition not event-gated",
  soulsHandSense.some((s) => s.mainPhaseClick && !s.eventGated && s.locs.includes("hand")),
);
const rodSense = parseCard(rod).map((c) => senseClause(rod, c));
check(
  "sense: Rod NS line is event-gated",
  rodSense.some((s) => s.eventGated && !s.mainPhaseClick),
);

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "card-sense checks failed");
  process.exit(1);
}
console.log(`ok — ${cases.length} card-sense / MP activation checks`);
