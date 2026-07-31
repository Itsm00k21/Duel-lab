import { createGame, reduce, findCardRef } from "../src/lib/game/engine";
import { isOneShotSpellTrap, staysOnFieldAfterActivate } from "../src/lib/rules/stLifecycle";
import type { CompactCard } from "../src/lib/cards/types";

const ritual: CompactCard = {
  id: 33599853,
  name: "Light and Darkness Ritual",
  type: "Spell Card",
  frameType: "spell",
  race: "Ritual",
  desc: "This card is used to Ritual Summon.",
};
const eternal: CompactCard = {
  id: 48680970,
  name: "Eternal Soul",
  type: "Trap Card",
  frameType: "trap",
  race: "Continuous",
  desc: "Every \"Dark Magician\" you control is unaffected.",
};
const salvation: CompactCard = {
  id: 95477924,
  name: "Magician's Salvation",
  type: "Spell Card",
  frameType: "spell",
  race: "Field",
  desc: 'When this card is activated: You can Set 1 "Eternal Soul" directly from your Deck.',
};

const cases: Array<{ name: string; ok: boolean }> = [];
function check(name: string, cond: boolean) {
  cases.push({ name, ok: cond });
}

check("ritual one-shot", isOneShotSpellTrap(ritual));
check("eternal stays", staysOnFieldAfterActivate(eternal));
check("field stays", staysOnFieldAfterActivate(salvation));

function deck(main: number[]) {
  return { id: "t", name: "t", formatId: "advanced" as const, notes: "", main, extra: [] as number[], side: [] as number[], createdAt: "", updatedAt: "" };
}

let s = createGame({
  formatId: "advanced",
  p1: { name: "P1", deck: deck(Array(40).fill(33599853)) },
  p2: { name: "P2", deck: deck(Array(40).fill(33599853)) },
});
s = reduce(s, {
  type: "PLAY",
  from: { owner: "p1", zone: "hand", index: 0 },
  player: "p1",
  mode: "activate-st",
  leaveOnResolve: "gy",
});
const inst = s.players.p1.spells.find(Boolean)?.instanceId;
check("ritual on field after activate", Boolean(inst));
s = reduce(s, {
  type: "CHAIN_ADD",
  player: "p1",
  cardId: 33599853,
  cardName: "Light and Darkness Ritual",
  instanceId: inst,
  spellSpeed: 1,
  kind: "spell",
  label: "Activate",
  cardActivation: true,
  leavesTo: "gy",
});
s = reduce(s, { type: "CHAIN_PASS", player: "p2" });
s = reduce(s, { type: "CHAIN_PASS", player: "p1" });
s = reduce(s, { type: "CHAIN_RESOLVE_ONE" });
const stillSt = s.players.p1.spells.some((c) => c?.instanceId === inst);
const inGy = s.players.p1.gy.some((c) => c.instanceId === inst);
check("ritual left field", !stillSt);
check("ritual in gy", inGy);
check("ref is gy", findCardRef(s, inst!)?.zone === "gy");

let s2 = createGame({
  formatId: "advanced",
  p1: { name: "P1", deck: deck(Array(40).fill(95477924)) },
  p2: { name: "P2", deck: deck(Array(40).fill(95477924)) },
});
s2 = reduce(s2, {
  type: "PLAY",
  from: { owner: "p1", zone: "hand", index: 0 },
  player: "p1",
  mode: "to-field",
});
check("field spell stays", Boolean(s2.players.p1.field));
check("field spell activation opens chain window", s2.fetBox === "D");

let fail = 0;
for (const x of cases) {
  if (!x.ok) {
    fail += 1;
    console.error("FAIL", x.name);
  }
}
if (fail) {
  console.error(fail, "st lifecycle failures");
  process.exit(1);
}
console.log(`ok — ${cases.length} st lifecycle checks`);
