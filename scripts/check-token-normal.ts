import { createGame, reduce } from "../src/lib/game/engine";
import { isTokenNormalMonster } from "../src/lib/rules/summonRules";
import { isEffectMonsterCard } from "../src/lib/rules/effectOps";
import {
  extraMaterialCandidates,
  parseExtraSummonSpec,
  validateExtraMaterials,
} from "../src/lib/rules/extraSummon";
import { effectTargetCandidates, parseEffectTargets } from "../src/lib/rules/effectTarget";
import type { CompactCard } from "../src/lib/cards/types";
import type { DeckList } from "../src/lib/deck/types";
import type { GameState, ZoneCard } from "../src/lib/game/types";

function deck(main: number[]): DeckList {
  return { id: "t", name: "t", formatId: "advanced", notes: "", main, extra: [], side: [], createdAt: "", updatedAt: "" };
}

function C(p: Partial<CompactCard> & { id: number; name: string; type: string; desc: string }): CompactCard {
  return { frameType: "effect", ...p };
}

const cases: Array<{ name: string; ok: boolean }> = [];
function check(name: string, cond: boolean) {
  cases.push({ name, ok: cond });
}

function fresh(): GameState {
  return createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck([1, 1, 1, 1, 1, 1, 1, 1]) },
    p2: { name: "P2", deck: deck([2, 2, 2, 2, 2, 2, 2, 2]) },
    startingHand: 3,
    startingPlayer: "p1",
  });
}

const lv4a = C({ id: 8, name: "Armageddon Knight", type: "Effect Monster", level: 4, desc: "x" });
const lv4b = C({ id: 9, name: "Goblin Attack Force", type: "Effect Monster", level: 4, desc: "x" });
const lv1 = C({ id: 20, name: "Mokey Mokey", type: "Normal Monster", level: 1, frameType: "normal", desc: "x" });
const dweller = C({
  id: 13,
  name: "Abyss Dweller",
  type: "Xyz Monster",
  frameType: "xyz",
  level: 4,
  desc: "2 Level 4 monsters\nWhile this card has a material attached that was originally WATER, all WATER monsters you control gain 500 ATK.",
});
const linkiboh = C({ id: 6, name: "Linkuriboh", type: "Link Monster", frameType: "link", linkval: 1, desc: "1 Level 1 monster" });
const sp = C({
  id: 10,
  name: "S:P Little Knight",
  type: "Link Monster",
  frameType: "link",
  linkval: 2,
  desc: "2 Effect Monsters, including a Link Monster\nIf this card is Special Summoned: You can target 1 card your opponent controls or in their GY; banish it.",
});
const tokenPrint = C({ id: 0, name: "Sheep Token", type: "Token", frameType: "token", desc: "This token cannot be Tributed." });

const byId = new Map<number, CompactCard>([lv4a, lv4b, lv1, dweller, linkiboh, sp, tokenPrint].map((c) => [c.id, c]));

function zc(id: number, extra: Partial<ZoneCard> = {}): ZoneCard {
  return { instanceId: `i${id}-${extra.isToken ? "tok" : "m"}`, cardId: id, faceUp: true, position: "atk", counters: 0, overlay: [], ...extra };
}

check("printed Token card is not an Effect Monster", !isEffectMonsterCard(tokenPrint));
check("printed Effect Monster still is Effect", isEffectMonsterCard(lv4a));
check("printed Normal Monster is not Effect", !isEffectMonsterCard(lv1));

let state = fresh();
state = reduce(state, { type: "TOKEN", player: "p1" });
const token = state.players.p1.monsters[0]!;
check("TOKEN isTokenNormalMonster", isTokenNormalMonster(token));
check("TOKEN card is not Effect Monster data", !isEffectMonsterCard(byId.get(token.cardId)));

const impermSpec = parseEffectTargets("Target 1 face-up Effect Monster your opponent controls; negate its effects.");
state.players.p2.monsters[0] = token;
state.players.p2.monsters[1] = zc(lv4a.id);
const effectCands = effectTargetCandidates(state, "p1", impermSpec!, byId);
check("Token is not an Effect Monster target", !effectCands.some((r) => r.card.instanceId === token.instanceId));
check("real Effect Monster still a target", effectCands.some((r) => r.card.cardId === lv4a.id));

state = fresh();
state = reduce(state, {
  type: "PLAY",
  from: { owner: "p1", zone: "hand", index: 0 },
  player: "p1",
  mode: "summon-atk",
});
const boss = state.players.p1.monsters[0]!;
state = reduce(state, { type: "TOKEN", player: "p1" });
const overlayToken = state.players.p1.monsters[1]!;
const tokenSlot = { owner: "p1" as const, zone: "monster" as const, index: 1 };
state = reduce(state, {
  type: "OVERLAY",
  from: tokenSlot,
  onto: { owner: "p1", zone: "monster", index: 0 },
});
check("OVERLAY token refused — token stays on field", state.players.p1.monsters[1]?.instanceId === overlayToken.instanceId);
check("OVERLAY token refused — nothing under target", (state.players.p1.monsters[0]?.overlay.length ?? -1) === 0);
check("OVERLAY token logs why", state.log.some((e) => /tokens cannot be used as xyz material/i.test(e.text)));
check("boss still on field after refused OVERLAY", state.players.p1.monsters[0]?.instanceId === boss.instanceId);

state = fresh();
state = reduce(state, {
  type: "PLAY",
  from: { owner: "p1", zone: "hand", index: 0 },
  player: "p1",
  mode: "summon-atk",
});
const onto = state.players.p1.monsters[0]!;
state = reduce(state, {
  type: "MOVE",
  from: { owner: "p1", zone: "hand", index: 0 },
  to: { owner: "p1", zone: "monster", index: 1 },
  faceUp: true,
  position: "atk",
});
const mat = state.players.p1.monsters[1]!;
state = reduce(state, {
  type: "OVERLAY",
  from: { owner: "p1", zone: "monster", index: 1 },
  onto: { owner: "p1", zone: "monster", index: 0 },
});
check("OVERLAY real monster attaches", state.players.p1.monsters[0]?.overlay.some((c) => c.instanceId === mat.instanceId) === true);
check("OVERLAY real monster leaves source slot", state.players.p1.monsters[1] == null);
check("xyz host still the same card", state.players.p1.monsters[0]?.instanceId === onto.instanceId);

const xyzSpec = parseExtraSummonSpec(dweller)!;
const linkSpec = parseExtraSummonSpec(linkiboh)!;
const spSpec = parseExtraSummonSpec(sp)!;
check("Linkuriboh does not require Effect materials", linkSpec.kind === "link" && !linkSpec.needEffect);
check("SP requires Effect materials", Boolean(spSpec.needEffect));

const sXyz = fresh();
sXyz.players.p1.monsters[0] = zc(lv4a.id, { isToken: true });
sXyz.players.p1.monsters[1] = zc(lv4b.id);
const xyzCands = extraMaterialCandidates(sXyz, "p1", xyzSpec, byId);
check("Xyz candidates still reject tokens", !xyzCands.some((r) => r.card.isToken));
check("Xyz candidates still list a real Lv4", xyzCands.some((r) => r.card.cardId === lv4b.id && !r.card.isToken));
check(
  "validateExtraMaterials rejects token as Xyz material",
  !validateExtraMaterials(
    xyzSpec,
    [
      { card: sXyz.players.p1.monsters[0]!, data: lv4a, ref: { owner: "p1", zone: "monster", index: 0 }, where: "Field" },
      { card: sXyz.players.p1.monsters[1]!, data: lv4b, ref: { owner: "p1", zone: "monster", index: 1 }, where: "Field" },
    ],
    sXyz,
    "p1",
    byId,
  ).ok,
);

const sLink = fresh();
sLink.players.p1.monsters[0] = zc(lv1.id, { isToken: true });
const linkCands = extraMaterialCandidates(sLink, "p1", linkSpec, byId);
check("Link path still allows a Token when the recipe is not Effect-only", linkCands.some((r) => r.card.isToken && r.card.cardId === lv1.id));

const sEff = fresh();
sEff.players.p1.monsters[0] = zc(lv4a.id, { isToken: true });
sEff.players.p1.monsters[1] = zc(6);
const spCands = extraMaterialCandidates(sEff, "p1", spSpec, byId);
check("Link Effect recipe does not treat Token as Effect", !spCands.some((r) => r.card.isToken));
check("Link Effect recipe still lists a real Link", spCands.some((r) => r.card.cardId === 6 && !r.card.isToken));

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "token-normal checks failed");
  process.exit(1);
}
console.log(`ok — ${cases.length} token-normal checks`);
