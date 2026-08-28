import { createGame, isFirstTurnStartingPlayer, reduce } from "../src/lib/game/engine";
import { canDeclareAttack } from "../src/lib/rules/battle";
import type { DeckList } from "../src/lib/deck/types";
import type { GameState } from "../src/lib/game/types";

function deck(main: number[]): DeckList {
  return { id: "t", name: "t", formatId: "advanced", notes: "", main, extra: [], side: [], createdAt: "", updatedAt: "" };
}

const cases: Array<{ name: string; ok: boolean }> = [];
function check(name: string, cond: boolean) {
  cases.push({ name, ok: cond });
}

function fresh(startingPlayer: "p1" | "p2" = "p1"): GameState {
  return createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck([1, 1, 1, 1, 1, 1, 1, 1]) },
    p2: { name: "P2", deck: deck([2, 2, 2, 2, 2, 2, 2, 2]) },
    startingHand: 3,
    startingPlayer,
  });
}

function sawNoBattleLog(state: GameState): boolean {
  return state.log.some((e) => /cannot conduct a Battle Phase/i.test(e.text));
}

let state = fresh("p1");
check("T1 P1 starts in M1", state.turn === 1 && state.activePlayer === "p1" && state.phase === "M1");
check("helper: T1 starting player", isFirstTurnStartingPlayer(state));
state = reduce(state, { type: "NEXT_PHASE" });
check("T1 P1 NEXT_PHASE from M1 lands M2", state.phase === "M2");
check("T1 P1 never sits in BP after M1 advance", state.phase !== "BP");
check("T1 P1 skip logs why", sawNoBattleLog(state));

state = reduce(state, { type: "PREV_PHASE" });
check("T1 P1 PREV_PHASE from M2 skips BP to M1", state.phase === "M1");

state = fresh("p1");
state = reduce(state, {
  type: "PLAY",
  from: { owner: "p1", zone: "hand", index: 0 },
  player: "p1",
  mode: "summon-atk",
});
const attacker = state.players.p1.monsters[0]!;
state.phase = "BP";
check("forced BP on T1 P1", state.phase === "BP" && isFirstTurnStartingPlayer(state));
check("canDeclareAttack false on forced T1 BP", !canDeclareAttack(state, "p1", attacker));
state = reduce(state, {
  type: "ATTACK",
  player: "p1",
  attackerId: attacker.instanceId,
  damage: 100,
  destroyTarget: false,
});
check(
  "ATTACK still refused if phase is forced",
  state.log.some((e) => /cannot attack on the first turn/i.test(e.text)),
);
check("forced ATTACK did not deal damage", state.players.p2.lp === 8000);
check("ATTACK refuse clamp leaves T1 P1 out of BP", state.phase !== "BP");

state = fresh("p1");
state = reduce(state, { type: "NEXT_TURN" });
check("T2 P2 is not the T1 starting player", state.turn === 2 && state.activePlayer === "p2" && !isFirstTurnStartingPlayer(state));
check("T2 P2 starts in DP", state.phase === "DP");
state = reduce(state, { type: "NEXT_PHASE" }); // SP
state = reduce(state, { type: "NEXT_PHASE" }); // M1
state = reduce(state, { type: "NEXT_PHASE" }); // BP
check("T2 P2 can enter BP", state.phase === "BP");

state = fresh("p2");
check("T1 P2 starting player helper", isFirstTurnStartingPlayer(state) && state.activePlayer === "p2");
state = reduce(state, { type: "NEXT_PHASE" });
check("T1 P2 (goes first) also skips BP", state.phase === "M2");

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "T1 battle phase checks failed");
  process.exit(1);
}
console.log(`ok — ${cases.length} T1 battle phase checks`);
