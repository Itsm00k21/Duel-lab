import { analyzeCard, isStarterName } from "../src/lib/bot/cardIntel";
import { comboStage, evaluateBoard } from "../src/lib/bot/boardEval";
import { decideBot } from "../src/lib/bot/decide";
import { botProfileFor } from "../src/lib/bot/profiles";
import { createGame } from "../src/lib/game/engine";
import type { CompactCard } from "../src/lib/cards/types";
import type { GameState, ZoneCard } from "../src/lib/game/types";

function C(p: Partial<CompactCard> & { id: number; name: string; type: string }): CompactCard {
  return { frameType: "effect", desc: p.desc ?? "", ...p };
}
function z(id: number, faceUp = true): ZoneCard {
  return { instanceId: `i${id}`, cardId: id, faceUp, position: "atk", counters: 0, overlay: [] };
}
function deck(main: number[]) {
  return { id: "t", name: "t", formatId: "advanced" as const, notes: "", main, extra: [] as number[], side: [] as number[], createdAt: "", updatedAt: "" };
}

const wanted = C({
  id: 80845034,
  name: "WANTED: Seeker of Sinful Spoils",
  type: "Spell Card",
  race: "Quick-Play",
  desc: 'Add 1 "Diabellstar" monster from your Deck or GY to your hand.',
});
const beryl = C({
  id: 63198739,
  name: "Primite Dragon Ether Beryl",
  type: "Effect Monster",
  desc: 'If this card is Normal Summoned: You can Set 1 "Primite" Spell/Trap from your Deck. You can Tribute this card; send 1 Normal Monster from your Deck to the GY.',
});
const vanilla = C({ id: 1, name: "Mystical Elf", type: "Normal Monster", atk: 800, level: 4, frameType: "normal", desc: "Normal." });
const remix = C({
  id: 2,
  name: "Kewl Tune Remix",
  type: "Synchro Monster",
  desc: "1 Tuner + 1+ non-Tuner. Once per turn (Quick Effect): You can negate the activation.",
});
const ash = C({
  id: 14558127,
  name: "Ash Blossom & Joyous Spring",
  type: "Tuner Monster",
  desc: 'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate that effect.\n● Add a card from the Deck to the hand.',
});
const imperm = C({
  id: 10045474,
  name: "Infinite Impermanence",
  type: "Trap Card",
  desc: "Target 1 face-up monster your opponent controls; negate its effects.",
});

const byId = new Map<number, CompactCard>([wanted, beryl, vanilla, remix, ash, imperm].map((c) => [c.id, c]));
const profile = botProfileFor("tcg-dark-magician-azamina");

const cases: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string) {
  cases.push({ name, ok, detail });
}

check("WANTED is starter+search", analyzeCard(wanted, profile).roles.includes("search") || isStarterName(wanted.name, profile));
check("Beryl is starter", isStarterName(beryl.name, profile));
check("Remix has interaction", analyzeCard(remix, profile).interaction >= 2);

let s = createGame({
  formatId: "advanced",
  startingPlayer: "p2",
  pve: { bot: "p2", premadeId: "tcg-dark-magician-azamina", deckName: "Bot" },
  p1: { name: "You", deck: deck(Array(40).fill(vanilla.id)) },
  p2: { name: "Bot", deck: deck(Array(40).fill(vanilla.id)) },
});
s = {
  ...s,
  activePlayer: "p2",
  phase: "M1",
  turn: 1,
  startingPlayer: "p2",
  fetBox: "A",
  players: {
    ...s.players,
    p2: {
      ...s.players.p2,
      hand: [z(wanted.id), z(vanilla.id), z(beryl.id)],
      monsters: [null, null, null, null, null],
      spells: [null, null, null, null, null],
    },
  },
} as GameState;
const d = decideBot(s, byId, {});
check(
  "prefers engine spell or starter NS over random brick first",
  Boolean(
    d &&
      d.type === "dispatch" &&
      d.action.type === "PLAY" &&
      (d.action.mode === "activate-st" || (d.action.mode === "summon-atk" && d.note?.includes("Beryl"))),
  ),
  d?.note,
);

const evalEmpty = evaluateBoard(s, "p2", byId, profile);
check("empty board eval", evalEmpty.monsters === 0 && evalEmpty.threat === 0);
s.players.p2.spells[0] = { ...z(imperm.id, false) };
s.players.p2.monsters[0] = z(remix.id, true);
const evalBoard = evaluateBoard(s, "p2", byId, profile);
check("set trap + negate boss scores interactions", evalBoard.interactions >= 3 || evalBoard.threat >= 8);
check(
  "combo stage after bodies",
  ["climb-extra", "protect-endboard", "extend-or-pass", "fire-engine", "normal-summon", "establish-body"].includes(
    comboStage(s, "p2", byId, profile),
  ),
);

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name, c.detail ?? "");
  }
}
if (fail) {
  console.error(fail, "bot-smart checks failed");
  process.exit(1);
}
console.log(`ok — ${cases.length} bot-smart checks`);
