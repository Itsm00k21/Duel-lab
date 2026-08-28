import { createGame, reduce } from "../src/lib/game/engine";
import { dedupeActivationScan, scanActivations } from "../src/lib/rules/scan";
import type { ActivationCandidate } from "../src/lib/rules/chain";
import type { CompactCard } from "../src/lib/cards/types";
import type { DeckList } from "../src/lib/deck/types";
import type { GameState } from "../src/lib/game/types";

function deck(main: number[]): DeckList {
  return { id: "t", name: "t", formatId: "advanced", notes: "", main, extra: [], side: [], createdAt: "", updatedAt: "" };
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

function tableSend(
  state: GameState,
  from: { owner: "p1"; zone: "monster"; index: number },
  zone: "gy" | "banish",
) {
  return reduce(state, { type: "MOVE", from, to: { owner: from.owner, zone }, faceUp: true });
}

let state = fresh();
state = reduce(state, { type: "TOKEN", player: "p1" });
const token = state.players.p1.monsters[0]!;
state = tableSend(state, { owner: "p1", zone: "monster", index: 0 }, "gy");
check("table MOVE token to GY vanishes", !state.players.p1.gy.some((c) => c.instanceId === token.instanceId) && state.players.p1.monsters[0] == null);

state = fresh();
state = reduce(state, { type: "TOKEN", player: "p1" });
const banToken = state.players.p1.monsters[0]!;
state = tableSend(state, { owner: "p1", zone: "monster", index: 0 }, "banish");
check("table MOVE token to Banish vanishes", !state.players.p1.banish.some((c) => c.instanceId === banToken.instanceId));

state = fresh();
const handCard = state.players.p1.hand[0]!;
state = reduce(state, {
  type: "MOVE",
  from: { owner: "p1", zone: "hand", index: 0 },
  to: { owner: "p1", zone: "gy" },
  faceUp: true,
});
check("table MOVE hand card to GY lands", state.players.p1.gy.some((c) => c.instanceId === handCard.instanceId));

state = fresh();
state = reduce(state, {
  type: "PLAY",
  from: { owner: "p1", zone: "hand", index: 0 },
  player: "p1",
  mode: "summon-atk",
});
const monster = state.players.p1.monsters[0]!;
state = tableSend(state, { owner: "p1", zone: "monster", index: 0 }, "gy");
check("table MOVE monster to GY lands", state.players.p1.gy.some((c) => c.instanceId === monster.instanceId));

state = fresh();
state = reduce(state, {
  type: "PLAY",
  from: { owner: "p1", zone: "hand", index: 0 },
  player: "p1",
  mode: "summon-atk",
});
state = reduce(state, { type: "TOKEN", player: "p1" });
const overlayTok = state.players.p1.monsters[1]!;
state = reduce(state, {
  type: "OVERLAY",
  from: { owner: "p1", zone: "monster", index: 1 },
  onto: { owner: "p1", zone: "monster", index: 0 },
});
check("OVERLAY token stays on field", state.players.p1.monsters[1]?.instanceId === overlayTok.instanceId);
check("OVERLAY token does not attach", (state.players.p1.monsters[0]?.overlay.length ?? -1) === 0);
check("OVERLAY token writes the engine log", state.log.some((e) => /tokens cannot be used as xyz material/i.test(e.text)));

state = fresh();
state = reduce(state, {
  type: "PLAY",
  from: { owner: "p1", zone: "hand", index: 0 },
  player: "p1",
  mode: "summon-atk",
});
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
check("OVERLAY real monster still attaches", state.players.p1.monsters[0]?.overlay.some((c) => c.instanceId === mat.instanceId) === true);

const eternal: CompactCard = {
  id: 48680970,
  name: "Eternal Soul",
  type: "Trap Card",
  frameType: "trap",
  race: "Continuous",
  desc: 'Every "Dark Magician" you control is unaffected by your opponent\'s card effects. If this card is sent from the field to the GY: Special Summon as many "Dark Magician" as possible from your GY. You can activate 1 of these effects;\n● Special Summon 1 "Dark Magician" from your hand or GY.\n● Add 1 "Dark Magician" or 1 card that mentions it from your Deck to your hand, except "Eternal Soul".\nYou can only use 1 "Eternal Soul" effect per turn, and only once that turn.',
};
const byId = new Map<number, CompactCard>([[eternal.id, eternal]]);
const scanState = fresh();
scanState.players.p1.spells[0] = {
  instanceId: "es1",
  cardId: eternal.id,
  name: eternal.name,
  faceUp: true,
  position: "atk",
  counters: 0,
  overlay: [],
};
const raw = scanActivations(scanState, byId);
const eternalRows = raw.filter((r) => r.instanceId === "es1");
check("live scan can emit more than one row per card+zone", eternalRows.length > 1);
const deduped = dedupeActivationScan(raw).filter((r) => r.instanceId === "es1");
check("dedupe keeps one OK/NO per card+zone", deduped.length === 1);

const stub = (legal: boolean, extra?: Partial<ActivationCandidate>): ActivationCandidate => ({
  cardId: 1,
  cardName: "X",
  owner: "p1",
  zoneLabel: "P1 S/T1",
  instanceId: "same",
  clause: null,
  clauseIndex: 0,
  spellSpeed: 1,
  kind: "trap",
  summary: "",
  warnings: [],
  legal,
  legalityReason: legal ? "ok" : "no",
  ...extra,
});
const collapsed = dedupeActivationScan([stub(false), stub(true, { clauseIndex: 1 }), stub(false, { clauseIndex: 2 })]);
check("dedupe prefers OK when mixed", collapsed.length === 1 && collapsed[0]!.legal);

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "playmat verb checks failed");
  process.exit(1);
}
console.log(`ok — ${cases.length} playmat verb checks`);
