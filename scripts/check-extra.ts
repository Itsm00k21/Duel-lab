import { parseExtraSummonSpec, parseAllExtraSummonSpecs, validateExtraMaterials, autoPickExtraMaterials, extraMaterialCandidates, type MaterialRow } from "../src/lib/rules/extraSummon";
import type { CompactCard } from "../src/lib/cards/types";
import type { GameState, PlayerId, ZoneCard } from "../src/lib/game/types";
import { EMPTY_CHAIN } from "../src/lib/rules/chain";
import { createGame, reduce } from "../src/lib/game/engine";
import type { DeckList } from "../src/lib/deck/types";

function C(p: Partial<CompactCard> & { id: number; name: string; type: string; desc: string }): CompactCard {
  return { frameType: "effect", ...p };
}

const sp = C({
  id: 10,
  name: "S:P Little Knight",
  type: "Link Monster",
  frameType: "link",
  linkval: 2,
  desc: "2 Effect Monsters, including a Link Monster\nIf this card is Special Summoned: You can target 1 card your opponent controls or in their GY; banish it.",
});
const ip = C({
  id: 11,
  name: "I:P Masquerena",
  type: "Link Monster",
  frameType: "link",
  linkval: 2,
  atk: 800,
  desc: "2 non-Link Monsters\nDuring your opponent's Main Phase, you can (Quick Effect): Immediately after this effect resolves, Link Summon 1 Link Monster using materials you control, including this card.",
});
const rose = C({
  id: 12,
  name: "Black Rose Dragon",
  type: "Synchro Monster",
  frameType: "synchro",
  level: 7,
  desc: "1 Tuner + 1+ non-Tuner monsters\nWhen this card is Synchro Summoned: You can destroy all cards on the field.",
});
const dweller = C({
  id: 13,
  name: "Abyss Dweller",
  type: "Xyz Monster",
  frameType: "xyz",
  level: 4,
  desc: "2 Level 4 monsters\nWhile this card has a material attached that was originally WATER, all WATER monsters you control gain 500 ATK.",
});
const dm = C({
  id: 14,
  name: "Dark Magician the Dragon Knight",
  type: "Fusion Monster",
  frameType: "fusion",
  desc: '"Dark Magician" + 1 Dragon monster\nThis card\'s name becomes "Dark Magician" while on the field or in the GY.',
});
const poly = C({
  id: 15,
  name: "Polymerization",
  type: "Spell Card",
  frameType: "spell",
  desc: "Fusion Summon 1 Fusion Monster from your Extra Deck, using monsters from your hand or field as Fusion Material.",
});
const ash = C({ id: 1, name: "Ash Blossom & Joyous Spring", type: "Tuner Monster", level: 3, desc: "When a card or effect is activated..." });
const elf = C({ id: 2, name: "Mystical Elf", type: "Normal Monster", level: 4, frameType: "normal", desc: "A cute elf." });
const gaia = C({ id: 3, name: "Gaia The Fierce Knight", type: "Normal Monster", level: 7, race: "Warrior", desc: "x" });
const magician = C({ id: 4, name: "Dark Magician", type: "Normal Monster", level: 7, race: "Spellcaster", desc: "x" });
const dragon = C({ id: 5, name: "Curse of Dragon", type: "Normal Monster", level: 5, race: "Dragon", desc: "x" });
const link2 = C({ id: 6, name: "Linkuriboh", type: "Link Monster", frameType: "link", linkval: 1, desc: "1 Level 1 monster" });
const eff4 = C({ id: 7, name: "Lonefire Blossom", type: "Effect Monster", level: 3, desc: "Once per turn: ..." });
const lv4a = C({ id: 8, name: "Armageddon Knight", type: "Effect Monster", level: 4, desc: "x" });
const lv4b = C({ id: 9, name: "Goblin Attack Force", type: "Effect Monster", level: 4, desc: "x" });

const cases: Array<{ name: string; ok: boolean }> = [];
function check(name: string, cond: boolean) {
  cases.push({ name, ok: cond });
}

const spSpec = parseExtraSummonSpec(sp);
check("SP parses link 2 effect incl link", Boolean(spSpec && spSpec.kind === "link" && spSpec.minCount === 2 && spSpec.needLink && spSpec.needEffect));
const roseSpec = parseExtraSummonSpec(rose);
check("BRD parses synchro 7", Boolean(roseSpec && roseSpec.kind === "synchro" && roseSpec.level === 7));
const xyzSpec = parseExtraSummonSpec(dweller);
check("Dweller parses xyz rank 4 x2", Boolean(xyzSpec && xyzSpec.kind === "xyz" && xyzSpec.rank === 4 && xyzSpec.minCount === 2));
const fusSpec = parseExtraSummonSpec(dm);
check("DM Dragon Knight fusion named", Boolean(fusSpec && fusSpec.kind === "fusion" && fusSpec.named?.includes("Dark Magician")));

function zc(id: number, faceUp = true): ZoneCard {
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
function st(over: Partial<GameState> = {}): GameState {
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

const byId = new Map<number, CompactCard>(
  [sp, ip, rose, dweller, dm, poly, ash, elf, gaia, magician, dragon, link2, eff4, lv4a, lv4b].map((c) => [c.id, c]),
);

const s1 = st();
s1.players.p1.monsters[0] = zc(eff4.id);
s1.players.p1.monsters[1] = zc(link2.id);
const rowsSP: MaterialRow[] = [
  { card: s1.players.p1.monsters[0]!, data: eff4, ref: { owner: "p1", zone: "monster", index: 0 }, where: "Field" },
  { card: s1.players.p1.monsters[1]!, data: link2, ref: { owner: "p1", zone: "monster", index: 1 }, where: "Field" },
];
check("SP legal with effect + link", validateExtraMaterials(spSpec!, rowsSP, s1, "p1", byId).ok);
check("SP illegal two normals", !validateExtraMaterials(spSpec!, [
  { card: zc(elf.id), data: elf, ref: { owner: "p1", zone: "monster", index: 0 }, where: "F" },
  { card: zc(gaia.id), data: gaia, ref: { owner: "p1", zone: "monster", index: 1 }, where: "F" },
], s1, "p1", byId).ok);

s1.players.p1.monsters[0] = zc(ash.id);
s1.players.p1.monsters[1] = zc(lv4a.id);
const autoRose = autoPickExtraMaterials(s1, "p1", rose, byId);
check("auto BRD 3+4=7", Boolean(autoRose && autoRose.refs.length === 2));

s1.players.p1.monsters[0] = zc(lv4a.id);
s1.players.p1.monsters[1] = zc(lv4b.id);
s1.players.p1.monsters[2] = null;
check("auto dweller 2 lv4", Boolean(autoPickExtraMaterials(s1, "p1", dweller, byId)?.refs.length === 2));

s1.players.p1.monsters[0] = zc(magician.id);
s1.players.p1.monsters[1] = zc(dragon.id);
s1.players.p1.hand = [zc(poly.id)];
check("fusion with poly + DM + dragon", Boolean(autoPickExtraMaterials(s1, "p1", dm, byId)?.refs.length));
s1.players.p1.hand = [];
check("fusion without poly blocked", autoPickExtraMaterials(s1, "p1", dm, byId) == null);

const dmod = C({
  id: 99,
  name: "Dark Magician of Destruction",
  type: "Fusion Monster",
  frameType: "fusion",
  level: 8,
  desc: '"Dark Magician" + 1 LIGHT or DARK monster\nMust be either Fusion Summoned, or Special Summoned (from your Extra Deck) during the turn a Spell Card or effect is activated, by banishing 1 Level 6 or higher DARK Spellcaster monster you control as material.',
});
byId.set(dmod.id, dmod);
byId.set(magician.id, { ...magician, attribute: "DARK", race: "Spellcaster", level: 7 });
byId.set(dragon.id, { ...dragon, attribute: "DARK", race: "Dragon", level: 4 });
const lv6sp = C({ id: 98, name: "Magician of Dark Illusion", type: "Effect Monster", attribute: "DARK", race: "Spellcaster", level: 7, desc: "x" });
byId.set(lv6sp.id, lv6sp);
const specs = parseAllExtraSummonSpecs(dmod);
check("DM Destruction has fusion + alt", specs.length === 2 && specs.some((s) => s.minCount === 1 && s.materialsMode === "banish" && s.levelMin === 6));
const sAlt = st({ activatedSpellThisTurn: true });
sAlt.players.p1.monsters[0] = zc(lv6sp.id);
sAlt.players.p1.monsters[1] = zc(dragon.id);
const alt = specs.find((s) => s.id.startsWith("alt"))!;
const altCands = extraMaterialCandidates(sAlt, "p1", alt, byId);
check("alt SS only lists Lv6+ DARK Spellcaster", altCands.length === 1 && altCands[0]!.data.name === "Magician of Dark Illusion");
const sNoSpell = st({ activatedSpellThisTurn: false });
sNoSpell.players.p1.monsters[0] = zc(lv6sp.id);
check("alt SS hidden before a Spell is activated", extraMaterialCandidates(sNoSpell, "p1", alt, byId).length === 0);

function deck(main: number[]): DeckList {
  return { id: "t", name: "t", formatId: "advanced", notes: "", main, extra: [sp.id], side: [], createdAt: "", updatedAt: "" };
}
let g = createGame({
  formatId: "advanced",
  p1: { name: "P1", deck: deck([1, 1, 1, 1, 1, 1, 1, 1]) },
  p2: { name: "P2", deck: deck([2, 2, 2, 2, 2, 2, 2, 2]) },
  startingHand: 1,
});
// put extra card
g.players.p1.extra = [{ instanceId: "ex1", cardId: sp.id, faceUp: true, position: "atk", counters: 0, overlay: [] }];
g = reduce(g, {
  type: "PLAY",
  from: { owner: "p1", zone: "extra", index: 0 },
  player: "p1",
  mode: "summon-atk",
  special: true,
});
check("engine blocks ED summon without materials", g.players.p1.extra.length === 1 && !g.players.p1.monsters.some(Boolean));

void ip;
void elf;
void gaia;

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "extra summon checks failed");
  process.exit(1);
}
console.log(`ok — ${cases.length} extra summon checks`);
