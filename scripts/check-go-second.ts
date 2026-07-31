import { createGame, reduce } from "../src/lib/game/engine";
import { decideBot } from "../src/lib/bot/decide";
import { canDeclareAttack } from "../src/lib/rules/battle";
import type { CompactCard } from "../src/lib/cards/types";
import type { DeckList } from "../src/lib/deck/types";
import type { ZoneCard } from "../src/lib/game/types";

function deck(main: number[]): DeckList {
  return { id: "t", name: "t", formatId: "advanced", notes: "", main, extra: [], side: [], createdAt: "", updatedAt: "" };
}
function C(p: Partial<CompactCard> & { id: number; name: string; type: string }): CompactCard {
  return { frameType: "effect", desc: p.desc ?? "", ...p };
}
const pole = C({ id: 1, name: "Mystical Elf", type: "Normal Monster", atk: 800, def: 2000, level: 4, frameType: "normal" });
const byId = new Map<number, CompactCard>([[pole.id, pole]]);

const cases: Array<{ name: string; ok: boolean }> = [];
function check(name: string, cond: boolean) {
  cases.push({ name, ok: cond });
}

let s = createGame({
  formatId: "advanced",
  startingPlayer: "p2",
  startingHand: 5,
  pve: { bot: "p2", premadeId: "generic", deckName: "Bot" },
  p1: { name: "You", deck: deck(Array(40).fill(pole.id)) },
  p2: { name: "Bot", deck: deck(Array(40).fill(pole.id)) },
});

check("go second: bot is active on turn 1", s.activePlayer === "p2" && s.startingPlayer === "p2" && s.turn === 1);
check("go second: starts in M1", s.phase === "M1");
check("go second: both have opening hands", s.players.p1.hand.length === 5 && s.players.p2.hand.length === 5);
check("go second: bot decides on opening turn", Boolean(decideBot(s, byId, {})?.type === "dispatch"));

const botMon: ZoneCard = {
  instanceId: "bm",
  cardId: pole.id,
  faceUp: true,
  position: "atk",
  counters: 0,
  overlay: [],
};
s.players.p2.monsters[0] = botMon;
check("go second: bot cannot attack on opening turn", !canDeclareAttack(s, "p2", botMon));

const p1HandBefore = s.players.p1.hand.length;
s = reduce(s, { type: "NEXT_TURN" });
check("after bot pass: it is your turn", s.activePlayer === "p1");
check("after bot pass: turn advanced", s.turn === 2);
check("after bot pass: you drew for turn", s.players.p1.hand.length === p1HandBefore + 1);
check("after bot pass: Draw Phase", s.phase === "DP");

s = reduce(s, { type: "NEXT_PHASE" }); // SP
s = reduce(s, { type: "NEXT_PHASE" }); // M1
s = reduce(s, { type: "NEXT_PHASE" }); // BP
s.players.p1.monsters[0] = {
  instanceId: "ym",
  cardId: pole.id,
  faceUp: true,
  position: "atk",
  counters: 0,
  overlay: [],
};
check("go second: you may attack on your first turn", canDeclareAttack(s, "p1", s.players.p1.monsters[0]!));

// explicit menu path startingPlayer p2 via "Go second"
let s2 = createGame({
  formatId: "advanced",
  startingPlayer: "p2",
  pve: { bot: "p2", premadeId: "generic", deckName: "Bot" },
  p1: { name: "You", deck: deck(Array(40).fill(pole.id)) },
  p2: { name: "Bot", deck: deck(Array(40).fill(pole.id)) },
});
s2 = reduce(s2, { type: "NEXT_TURN" });
s2 = reduce(s2, { type: "NEXT_TURN" });
check("turn 3 is bot again", s2.turn === 3 && s2.activePlayer === "p2");
check("bot second turn can attack (not opening)", s2.turn !== 1);

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "go-second checks failed");
  process.exit(1);
}
console.log(`ok — ${cases.length} go-second checks`);
