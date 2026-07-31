import { createGame, reduce } from "../src/lib/game/engine";
import { isLegalManualMove } from "../src/lib/rules/moveLegality";
import type { DeckList } from "../src/lib/deck/types";

function deck(main: number[]): DeckList {
  return { id: "t", name: "t", formatId: "advanced", notes: "", main, extra: [], side: [], createdAt: "", updatedAt: "" };
}

const cases: Array<{ name: string; ok: boolean }> = [];
function check(name: string, cond: boolean) {
  cases.push({ name, ok: cond });
}

let state = createGame({
  formatId: "advanced",
  p1: { name: "P1", deck: deck([1, 1, 1, 1, 1, 1, 1, 1]) },
  p2: { name: "P2", deck: deck([2, 2, 2, 2, 2, 2, 2, 2]) },
  startingHand: 3,
  startingPlayer: "p1",
});

const p1 = state.players.p1.hand[0]!;
const p2 = state.players.p2.hand[0]!;
state = reduce(state, {
  type: "PLAY",
  from: { owner: "p1", zone: "hand", index: 0 },
  player: "p1",
  mode: "summon-atk",
});
state = reduce(state, {
  type: "MOVE",
  from: { owner: "p2", zone: "hand", index: 0 },
  to: { owner: "p2", zone: "monster", index: 0 },
  faceUp: true,
  position: "atk",
});

const p1Mon = { owner: "p1" as const, zone: "monster" as const, index: 0 };
const p2Mon = { owner: "p2" as const, zone: "monster" as const, index: 0 };
const p1Hand = { owner: "p1" as const, zone: "hand" as const };
const p2Hand = { owner: "p2" as const, zone: "hand" as const };
const p1Gy = { owner: "p1" as const, zone: "gy" as const };
const p2Gy = { owner: "p2" as const, zone: "gy" as const };

check("can't bounce own monster to hand", !isLegalManualMove(state, "p1", p1Mon, p1Hand).ok);
check("can't bounce opp monster to your hand", !isLegalManualMove(state, "p1", p2Mon, p1Hand).ok);
check("can't bounce opp monster to their hand", !isLegalManualMove(state, "p1", p2Mon, p2Hand).ok);
check("can't move opp monster to GY", !isLegalManualMove(state, "p1", p2Mon, p1Gy).ok && !isLegalManualMove(state, "p1", p2Mon, p2Gy).ok);
check("can't freely send own monster to GY", !isLegalManualMove(state, "p1", p1Mon, p1Gy).ok);
check("can't freely banish own monster", !isLegalManualMove(state, "p1", p1Mon, { owner: "p1", zone: "banish" }).ok);

state = reduce(state, {
  type: "MOVE",
  from: p1Mon,
  to: p1Hand,
  faceUp: true,
  manual: true,
  player: "p1",
});
check("engine blocks manual bounce", Boolean(state.players.p1.monsters[0]));

state = reduce(state, {
  type: "MOVE",
  from: p2Mon,
  to: p1Hand,
  faceUp: true,
  manual: true,
  player: "p1",
});
check("engine blocks stealing opp monster", Boolean(state.players.p2.monsters[0]));

// effect bounce still works
state = reduce(state, {
  type: "MOVE",
  from: p1Mon,
  to: p1Hand,
  faceUp: true,
});
check("effect bounce still allowed", !state.players.p1.monsters[0] && state.players.p1.hand.some((c) => c.instanceId === p1.instanceId || c.cardId === p1.cardId));

// effect send to GY still works
const handCard = state.players.p1.hand[0]!;
state = reduce(state, {
  type: "MOVE",
  from: { owner: "p1", zone: "hand", index: 0 },
  to: p1Gy,
  faceUp: true,
});
check("effect send to GY still allowed", state.players.p1.gy.some((c) => c.instanceId === handCard.instanceId));

void p2;
let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "move checks failed");
  process.exit(1);
}
console.log(`ok — ${cases.length} move legality checks`);
