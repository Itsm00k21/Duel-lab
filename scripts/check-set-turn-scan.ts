import { createGame, reduce } from "../src/lib/game/engine";
import { activationOptions } from "../src/lib/rules/activationWindow";
import { dedupeActivationScan, scanActivations } from "../src/lib/rules/scan";
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

const jar: CompactCard = {
  id: 83968380,
  name: "Jar of Greed",
  type: "Trap Card",
  frameType: "trap",
  race: "Normal",
  desc: "Draw 1 card.",
};
const eternal: CompactCard = {
  id: 48680970,
  name: "Eternal Soul",
  type: "Trap Card",
  frameType: "trap",
  race: "Continuous",
  desc: 'Every "Dark Magician" you control is unaffected by your opponent\'s card effects. If this card is sent from the field to the GY: Special Summon as many "Dark Magician" as possible from your GY. You can activate 1 of these effects;\n● Special Summon 1 "Dark Magician" from your hand or GY.\n● Add 1 "Dark Magician" or 1 card that mentions it from your Deck to your hand, except "Eternal Soul".\nYou can only use 1 "Eternal Soul" effect per turn, and only once that turn.',
};
const byId = new Map<number, CompactCard>([
  [jar.id, jar],
  [eternal.id, eternal],
]);

function startWith(cardId: number): GameState {
  return createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck(Array(12).fill(cardId)) },
    p2: { name: "P2", deck: deck(Array(12).fill(cardId)) },
    startingHand: 3,
    startingPlayer: "p1",
  });
}

function setFromHand(state: GameState): GameState {
  return reduce(state, {
    type: "PLAY",
    from: { owner: "p1", zone: "hand", index: 0 },
    player: "p1",
    mode: "set-st",
  });
}

let state = setFromHand(startWith(jar.id));
const setJar = state.players.p1.spells.find(Boolean)!;
check("PLAY set-st stamps setTurn on Jar of Greed", setJar.setTurn === state.turn && !setJar.faceUp);
check(
  "activationOptions hide same-turn Set Trap",
  activationOptions(state, jar, setJar, "st", "p1", byId).length === 0,
);
const jarScan = scanActivations(state, byId).filter((r) => r.instanceId === setJar.instanceId);
const jarLive = dedupeActivationScan(jarScan);
check("same-turn Jar scan is all NO", jarScan.length > 0 && jarScan.every((r) => !r.legal));
check("Live scan one NO for same-turn Set Trap", jarLive.length === 1 && !jarLive[0]!.legal);
check(
  "NO reason is Set-this-turn, not stale untracked",
  jarLive.some((r) => /cannot be activated the turn they are Set/i.test(r.legalityReason)),
);
check(
  "stale Set-turn warning gone",
  !jarScan.some((r) => r.warnings.some((w) => /does not track Set turn/i.test(w))),
);

state = setFromHand(startWith(eternal.id));
const setEs = state.players.p1.spells.find(Boolean)!;
check("PLAY set-st stamps setTurn on Eternal Soul", setEs.setTurn === state.turn && !setEs.faceUp);
check(
  "Continuous Trap same lock as Normal — options empty",
  activationOptions(state, eternal, setEs, "st", "p1", byId).length === 0,
);
const esScan = scanActivations(state, byId).filter((r) => r.instanceId === setEs.instanceId);
const esLive = dedupeActivationScan(esScan);
check("same-turn Eternal Soul scan is all NO", esScan.length > 0 && esScan.every((r) => !r.legal));
check("Live scan one NO for same-turn Continuous Trap", esLive.length === 1 && !esLive[0]!.legal);
check(
  "Continuous NO is Set-this-turn",
  esLive.some((r) => /cannot be activated the turn they are Set/i.test(r.legalityReason)),
);

state = reduce(state, { type: "NEXT_TURN" });
state = reduce(state, { type: "NEXT_TURN" });
check("later turn, same Set copy still face-down", Boolean(state.players.p1.spells[0] && !state.players.p1.spells[0]!.faceUp));
check("later turn setTurn is not this turn", state.players.p1.spells[0]!.setTurn !== state.turn);
const later = scanActivations(state, byId).filter((r) => r.instanceId === setEs.instanceId);
check(
  "face-down Trap from a prior turn is not all Set-this-turn NO",
  later.some((r) => r.legal) && !later.every((r) => /cannot be activated the turn they are Set/i.test(r.legalityReason)),
);

const prior = startWith(eternal.id);
prior.turn = 2;
prior.phase = "M1";
prior.players.p1.spells[0] = {
  instanceId: "es-up",
  cardId: eternal.id,
  name: eternal.name,
  faceUp: true,
  position: "atk",
  counters: 0,
  overlay: [],
  setTurn: 1,
};
const upRows = scanActivations(prior, byId).filter((r) => r.instanceId === "es-up");
check("face-up Eternal Soul from a prior turn has scan rows", upRows.length > 0);
check(
  "face-up effect lines are not Set-this-turn",
  !upRows.some((r) => /cannot be activated the turn they are Set/i.test(r.legalityReason)),
);
check(
  "face-up prior-turn Eternal Soul can be OK",
  upRows.some((r) => r.legal),
);

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "set-turn scan checks failed");
  process.exit(1);
}
console.log(`ok — ${cases.length} set-turn scan checks`);
