import { createGame, reduce } from "../src/lib/game/engine";
import type { DeckList } from "../src/lib/deck/types";
import type { GameState, PlayerId, ZoneCard } from "../src/lib/game/types";

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

function pilesOf(state: GameState, owner: PlayerId): ZoneCard[] {
  const p = state.players[owner];
  return [...p.gy, ...p.hand, ...p.deck, ...p.banish, ...p.extra, ...p.side];
}

function sitsInPile(state: GameState, instanceId: string): boolean {
  return pilesOf(state, "p1").some((c) => c.instanceId === instanceId) || pilesOf(state, "p2").some((c) => c.instanceId === instanceId);
}

function tokenOnField(state: GameState): ZoneCard | null {
  return state.players.p1.monsters.find((c) => c?.isToken) ?? state.players.p2.monsters.find((c) => c?.isToken) ?? null;
}

let state = fresh();
state = reduce(state, { type: "TOKEN", player: "p2" });
const token = state.players.p2.monsters[0]!;
check("TOKEN lands on first empty MMZ", Boolean(token?.isToken));
const tokenId = token.instanceId;

state = reduce(state, {
  type: "PLAY",
  from: { owner: "p1", zone: "hand", index: 0 },
  player: "p1",
  mode: "summon-atk",
});
const attacker = state.players.p1.monsters[0]!;
check("attacker on field for ATTACK", Boolean(attacker) && !attacker.isToken);

state.turn = 2;
state.phase = "BP";
state.activePlayer = "p1";
state = reduce(state, {
  type: "ATTACK",
  player: "p1",
  attackerId: attacker.instanceId,
  target: { owner: "p2", zone: "monster", index: 0 },
  damage: 0,
  destroyTarget: true,
});
check("token destroyed by ATTACK leaves the MMZ", state.players.p2.monsters[0] == null);
check("token destroyed by ATTACK does not appear in GY", !sitsInPile(state, tokenId));
check("token destroyed by ATTACK is gone from the field", tokenOnField(state) == null);

state = fresh();
state = reduce(state, { type: "TOKEN", player: "p1" });
const moveGyToken = state.players.p1.monsters[0]!;
state = reduce(state, {
  type: "MOVE",
  from: { owner: "p1", zone: "monster", index: 0 },
  to: { owner: "p1", zone: "gy" },
  faceUp: true,
});
check("token MOVE to GY leaves the MMZ", state.players.p1.monsters[0] == null);
check("token MOVE to GY vanishes (not in GY)", !state.players.p1.gy.some((c) => c.instanceId === moveGyToken.instanceId));
check("token MOVE to GY does not sit in any pile", !sitsInPile(state, moveGyToken.instanceId));
check("token MOVE to GY does not fire sent-gy lastEvent", state.lastEvent?.type !== "sent-gy" || state.lastEvent.instanceId !== moveGyToken.instanceId);

state = fresh();
state = reduce(state, { type: "TOKEN", player: "p1" });
const moveHandToken = state.players.p1.monsters[0]!;
state = reduce(state, {
  type: "MOVE",
  from: { owner: "p1", zone: "monster", index: 0 },
  to: { owner: "p1", zone: "hand" },
  faceUp: true,
});
check("token MOVE to hand leaves the MMZ", state.players.p1.monsters[0] == null);
check("token MOVE to hand vanishes (not in hand)", !state.players.p1.hand.some((c) => c.instanceId === moveHandToken.instanceId));
check("token MOVE to hand does not sit in any pile", !sitsInPile(state, moveHandToken.instanceId));

state = fresh();
const monster = state.players.p1.hand[0]!;
state = reduce(state, {
  type: "PLAY",
  from: { owner: "p1", zone: "hand", index: 0 },
  player: "p1",
  mode: "summon-atk",
});
state = reduce(state, {
  type: "MOVE",
  from: { owner: "p1", zone: "monster", index: 0 },
  to: { owner: "p1", zone: "gy" },
  faceUp: true,
});
check("normal monster MOVE to GY lands in GY", state.players.p1.gy.some((c) => c.instanceId === monster.instanceId));
check("normal monster MOVE to GY fires sent-gy lastEvent", state.lastEvent?.type === "sent-gy" && state.lastEvent.instanceId === monster.instanceId);

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "token vanish checks failed");
  process.exit(1);
}
console.log(`ok — ${cases.length} token vanish checks`);
