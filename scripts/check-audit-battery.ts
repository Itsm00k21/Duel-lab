import { activationOptions } from "../src/lib/rules/activationWindow";
import { parseCard } from "../src/lib/rules/psct";
import { conditionMatchesEvent } from "../src/lib/rules/triggerMatch";
import { cardOptPolicy, effectUseScope } from "../src/lib/rules/effectOpt";
import { staysOnFieldAfterActivate } from "../src/lib/rules/stLifecycle";
import { isLingeringMonsterNegate, monsterEffectsAreNegated, parseEffectTargets } from "../src/lib/rules/effectTarget";
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

const beryl = card({
  id: 63198739, name: "Primite Dragon Ether Beryl",
  desc: 'If this card is Normal Summoned: You can Set 1 "Primite" Spell/Trap from your Deck. You can only use each of the following effects of "Primite Dragon Ether Beryl" once per turn. You can Tribute this card; send 1 Normal Monster from your Deck to the GY. During your Standby Phase, if you have a Normal Monster in your field or GY: You can add this card from the GY to your hand.',
});
const deception = card({
  id: 66328392, name: "Deception of the Sinful Spoils", type: "Spell Card", race: "Continuous",
  desc: 'You can Tribute 1 monster from your hand or field; add 1 "Azamina" card from your Deck to your hand. If a monster(s) is sent to your opponent\'s GY, and you control an "Azamina" monster (except during the Damage Step): You can make your opponent lose 1500 LP, and if you do, gain 1500 LP. During the End Phase, if this card is in the GY because it was sent there from the Spell & Trap Zone this turn while face-up: You can Set it. You can only use each effect of "Deception of the Sinful Spoils" once per turn.',
});
const wanted = card({
  id: 80845034, name: "WANTED: Seeker of Sinful Spoils", type: "Spell Card", race: "Quick-Play",
  desc: 'Add 1 "Diabellstar" monster from your Deck or GY to your hand. During your Main Phase: You can banish this card from your GY, then target 1 of your "Sinful Spoils" Spells/Traps that is banished or in your GY, except "WANTED: Seeker of Sinful Spoils"; place it on the bottom of the Deck, then draw 1 card. You can only use each effect of "WANTED: Seeker of Sinful Spoils" once per turn.',
});
const eternal = card({
  id: 48680970, name: "Eternal Soul", type: "Trap Card", race: "Continuous",
  desc: 'Every "Dark Magician" you control is unaffected by your opponent\'s card effects. If this card is sent from the field to the GY: Special Summon as many "Dark Magician" as possible from your GY. You can activate 1 of these effects;\n● Special Summon 1 "Dark Magician" from your hand or GY.\n● Add 1 "Dark Magician" or 1 card that mentions it from your Deck to your hand, except "Eternal Soul".\nYou can only use 1 "Eternal Soul" effect per turn, and only once that turn.',
});
const azamina = card({ id: 9001, name: "Azamina Moa Regina", type: "Fusion Monster", archetype: "Azamina", desc: "Fusion." });
const dm = card({ id: 46986414, name: "Dark Magician", type: "Normal Monster", desc: "Wizard.", frameType: "normal" });
const foolish = card({ id: 81439173, name: "Foolish Burial", type: "Spell Card", race: "Normal", desc: "Send 1 monster from your Deck to the GY." });

const byId = new Map([beryl, deception, wanted, eternal, azamina, dm, foolish].map((c) => [c.id, c] as const));

const cases: Array<{ name: string; ok: boolean }> = [];
function check(name: string, cond: boolean) {
  cases.push({ name, ok: cond });
}

const gyNoNm = state({ phase: "SP" });
gyNoNm.players.p1.gy = [z(beryl.id)];
check(
  "A1 Beryl GY recycle without Normal hidden",
  !activationOptions(gyNoNm, beryl, gyNoNm.players.p1.gy[0]!, "gy", "p1", byId).some((o) => /add this card/i.test(o.menuLabel + o.summary)),
);
const gyNm = state({ phase: "SP" });
gyNm.players.p1.gy = [z(beryl.id), z(dm.id)];
check(
  "A1 Beryl GY recycle with NM in GY",
  activationOptions(gyNm, beryl, gyNm.players.p1.gy[0]!, "gy", "p1", byId).some((o) => /add this card/i.test(o.menuLabel + o.summary)),
);

const dec = state({ fetBox: "yellow", lastEvent: { type: "summon", player: "p1", controller: "p1", cardId: 1, summonKind: "normal" } });
dec.players.p1.spells[0] = z(deception.id, true);
check(
  "A1 Deception drain without Azamina hidden",
  !activationOptions(dec, deception, dec.players.p1.spells[0]!, "st", "p1", byId).some((o) => /1500/i.test(o.menuLabel + o.summary)),
);
const decOk = state({
  fetBox: "yellow",
  lastEvent: { type: "sent-gy", player: "p2", controller: "p1", cardId: dm.id },
});
decOk.players.p1.spells[0] = z(deception.id, true);
decOk.players.p1.monsters[0] = z(azamina.id, true);
check(
  "A1 Deception drain with Azamina + sent-gy event",
  activationOptions(decOk, deception, decOk.players.p1.spells[0]!, "st", "p1", byId).some((o) => /1500/i.test(o.menuLabel + o.summary)) ||
    conditionMatchesEvent(parseCard(deception).find((c) => /1500/.test(c.raw))!, decOk.lastEvent!, { owner: "p1", isEventCard: false }),
);

const w = state({ phase: "M1" });
w.players.p1.gy = [z(wanted.id)];
check(
  "A1 WANTED GY MP offered",
  activationOptions(w, wanted, w.players.p1.gy[0]!, "gy", "p1", byId).some((o) => o.mode === "effect"),
);
const wOpp = state({ phase: "M1", activePlayer: "p2" });
wOpp.players.p1.gy = [z(wanted.id)];
check(
  "A1 WANTED GY opp turn hidden",
  !activationOptions(wOpp, wanted, wOpp.players.p1.gy[0]!, "gy", "p1", byId).some((o) => o.mode === "effect"),
);

const es = state({ phase: "M1", activePlayer: "p2", fetBox: "A" });
es.players.p1.spells[0] = z(eternal.id, true);
check(
  "A1 Eternal Soul opp turn face-up effect",
  activationOptions(es, eternal, es.players.p1.spells[0]!, "st", "p1", byId).some((o) => o.mode === "effect" && o.spellSpeed >= 2),
);

check("A3 Foolish is one-shot", !staysOnFieldAfterActivate(foolish));
check("A3 Deception stays", staysOnFieldAfterActivate(deception));
check("A3 WANTED is one-shot", !staysOnFieldAfterActivate(wanted));

const pol = cardOptPolicy(beryl);
check("A5 Beryl followingOnly", pol.followingOnly);
const clauses = parseCard(beryl);
check("A5 Beryl NS scope none/soft not hard-following", effectUseScope(beryl, clauses[0]!, 0) !== "hard");
const trib = clauses.findIndex((c) => /tribute this card/i.test(c.raw));
check("A5 Beryl tribute hard OPT", trib >= 0 && effectUseScope(beryl, clauses[trib]!, trib) === "hard");

check(
  "A2 Deception opp GY trigger match",
  conditionMatchesEvent(parseCard(deception).find((c) => /1500/.test(c.raw))!, { type: "sent-gy", player: "p2", controller: "p1" }, { owner: "p1", isEventCard: false }),
);

const gaze = card({
  id: 71466592,
  name: "The Gaze of Timaeus",
  type: "Spell Card",
  race: "Quick-Play",
  desc: 'Target 1 "Dark Magician" or "Dark Magician Girl" in your field or GY; Fusion Summon 1 Fusion Monster from your Extra Deck that mentions that monster as material, by shuffling it into the Deck as material (this is treated as a Fusion Summon with "The Eye of Timaeus"), but banish it during the End Phase of the next turn. You can only activate 1 "The Gaze of Timaeus" per turn.',
});
const impermC = card({
  id: 10045474,
  name: "Infinite Impermanence",
  type: "Trap Card",
  desc: "Target 1 face-up monster your opponent controls; negate its effects until the end of this turn. If this card was Set before activation and is on the field at resolution, for the rest of this turn all other Spell/Trap effects in this column are negated. If you control no cards, you can activate this card from your hand.",
});
const rtm = card({
  id: 55555,
  name: "Radiant Typhoon Manifestation",
  type: "Spell Card",
  race: "Quick-Play",
  desc: 'If this card is destroyed by the effect of "Mystical Space Typhoon": You can Set this card. Activate 1 of these effects (but you can only use each of these effects of "Radiant Typhoon Manifestation" once per turn);\n● Send 1 "Radiant Typhoon" monster from your Deck to the GY.\n● Add 1 "Mystical Space Typhoon" from your Deck or GY to your hand.',
});
byId.set(gaze.id, gaze);
byId.set(impermC.id, impermC);
byId.set(rtm.id, rtm);

const chainS = state({
  activePlayer: "p2",
  fetBox: "D",
  chain: {
    links: [
      {
        id: "c1",
        link: 1,
        player: "p2",
        cardId: rtm.id,
        cardName: rtm.name,
        spellSpeed: 2,
        kind: "spell",
        label: "Activate",
      },
    ],
    resolved: [],
    pendingPlayer: "p1",
    consecutivePasses: 0,
    complete: false,
  },
});
chainS.players.p1.hand = [z(gaze.id), z(impermC.id)];
check(
  "False chain: Gaze not live on opp turn / no DM",
  !activationOptions(chainS, gaze, chainS.players.p1.hand[0]!, "hand", "p1", byId).some((o) => o.mode === "card" || o.mode === "effect"),
);
check(
  "False chain: Imperm hand no opp monster",
  !activationOptions(chainS, impermC, chainS.players.p1.hand[1]!, "hand", "p1", byId).some((o) => o.mode === "card"),
);
chainS.players.p2.monsters[0] = z(azamina.id, true);
check(
  "Imperm hand legal with empty field + opp monster",
  activationOptions(chainS, impermC, chainS.players.p1.hand[1]!, "hand", "p1", byId).some((o) => o.mode === "card"),
);
const gazeTurn = state({ activePlayer: "p1", phase: "M1" });
gazeTurn.players.p1.hand = [z(gaze.id)];
check(
  "Gaze QP your turn without DM hidden",
  !activationOptions(gazeTurn, gaze, gazeTurn.players.p1.hand[0]!, "hand", "p1", byId).some((o) => o.mode === "card"),
);
gazeTurn.players.p1.gy = [z(dm.id)];
check(
  "Gaze QP your turn with DM in GY",
  activationOptions(gazeTurn, gaze, gazeTurn.players.p1.hand[0]!, "hand", "p1", byId).some((o) => o.mode === "card"),
);

const droll = card({
  id: 94145021,
  name: "Droll & Lock Bird",
  desc: "If a card(s) is added from the Main Deck to your opponent's hand, except during the Draw Phase (Quick Effect): You can send this card from your hand to the GY; for the rest of this turn, cards cannot be added from either player's Main Deck to the hand.",
});
byId.set(droll.id, droll);
const drollSs = state({
  activePlayer: "p1",
  fetBox: "yellow",
  lastEvent: { type: "summon", player: "p1", controller: "p1", cardId: 9, summonKind: "special" },
});
drollSs.players.p2.hand = [z(droll.id)];
check(
  "Droll hidden after SS from deck (not an add)",
  activationOptions(drollSs, droll, drollSs.players.p2.hand[0]!, "hand", "p2", byId).filter((o) => o.mode === "effect").length === 0,
);
const drollAdd = state({
  activePlayer: "p1",
  phase: "M1",
  fetBox: "yellow",
  lastEvent: { type: "add-to-hand", player: "p1", toPlayer: "p1", controller: "p1", fromZone: "deck", phase: "M1" },
});
drollAdd.players.p2.hand = [z(droll.id)];
check(
  "Droll live after opponent adds from deck",
  activationOptions(drollAdd, droll, drollAdd.players.p2.hand[0]!, "hand", "p2", byId).some((o) => o.mode === "effect"),
);
const drollSelf = state({
  fetBox: "yellow",
  lastEvent: { type: "add-to-hand", player: "p2", toPlayer: "p2", controller: "p2", fromZone: "deck", phase: "M1" },
});
drollSelf.players.p2.hand = [z(droll.id)];
check(
  "Droll hidden when you add to your own hand",
  activationOptions(drollSelf, droll, drollSelf.players.p2.hand[0]!, "hand", "p2", byId).filter((o) => o.mode === "effect").length === 0,
);
check(
  "Droll trigger matches add-to-hand event",
  conditionMatchesEvent(parseCard(droll)[0]!, { type: "add-to-hand", player: "p1", toPlayer: "p1", fromZone: "deck", phase: "M1" }, { owner: "p2", isEventCard: false }),
);

const impermText =
  "Target 1 face-up monster your opponent controls; negate its effects until the end of this turn. If this card was Set before activation and is on the field at resolution, for the rest of this turn all other Spell/Trap effects in this column are negated. If you control no cards, you can activate this card from your hand.";
check("Imperm is lingering monster negate", isLingeringMonsterNegate(impermText));
check("Ash is not lingering monster negate", !isLingeringMonsterNegate("discard this card; negate that effect."));
check("Imperm parses opp monster target", parseEffectTargets(impermText)?.kind === "opp-monster");
const negMon = state({ turn: 3 });
negMon.players.p1.monsters[0] = { ...z(beryl.id), effectsNegatedUntilTurn: 3 };
check("negated flag active this turn", monsterEffectsAreNegated(negMon.players.p1.monsters[0], 3));
check(
  "negated monster offers no field effects",
  activationOptions(negMon, beryl, negMon.players.p1.monsters[0]!, "field", "p1", byId).length === 0,
);

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "audit battery failure(s)");
  process.exit(1);
}
console.log(`ok — ${cases.length} cross-audit checks`);
