import { createGame, reduce } from "../src/lib/game/engine";
import { activationOptions } from "../src/lib/rules/activationWindow";
import { explainActivationDenial } from "../src/lib/rules/activationDebug";
import { evaluateResponse, parseResponseGate } from "../src/lib/rules/responseGate";
import { parseCard } from "../src/lib/rules/psct";
import { decideBot } from "../src/lib/bot/decide";
import type { CompactCard } from "../src/lib/cards/types";
import type { DeckList } from "../src/lib/deck/types";
import type { GameState, ZoneCard } from "../src/lib/game/types";

function deck(main: number[]): DeckList {
  return { id: "t", name: "t", formatId: "advanced", notes: "", main, extra: [], side: [], createdAt: "", updatedAt: "" };
}
function C(p: Partial<CompactCard> & { id: number; name: string; type: string; desc: string }): CompactCard {
  return { frameType: p.frameType ?? "effect", ...p };
}
function z(cardId: number, faceUp = true): ZoneCard {
  return { instanceId: `i${cardId}`, cardId, faceUp, position: "atk", counters: 0, overlay: [] };
}

const ash = C({
  id: 14558127,
  name: "Ash Blossom & Joyous Spring",
  type: "Effect Monster",
  desc: 'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate that effect.\n● Add a card from the Deck to the hand.\n● Special Summon from the Deck.\n● Send a card from the Deck to the GY.\nYou can only use this effect of "Ash Blossom & Joyous Spring" once per turn.',
});
const belle = C({
  id: 73642296,
  name: "Ghost Belle & Haunted Mansion",
  type: "Effect Monster",
  desc: 'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card from your hand; negate that activation.\n● Add a card(s) from the GY to the hand, Deck, or Extra Deck.\n● Special Summon a Monster Card(s) from the GY.\n● Banish a card(s) from the GY.\nYou can only use this effect of "Ghost Belle & Haunted Mansion" once per turn.',
});
const imperm = C({
  id: 10045474,
  name: "Infinite Impermanence",
  type: "Trap Card",
  frameType: "trap",
  desc: "Target 1 face-up monster your opponent controls; negate its effects until the end of this turn. If this card was Set before activation and is on the field at resolution, for the rest of this turn all other Spell/Trap effects in this column are negated. If you control no cards, you can activate this card from your hand.",
});
const foolish = C({
  id: 81439173,
  name: "Foolish Burial",
  type: "Spell Card",
  frameType: "spell",
  race: "Normal",
  desc: "Send 1 monster from your Deck to the GY.",
});
const lode = C({
  id: 56506740,
  name: "Primite Lordly Lode",
  type: "Spell Card",
  frameType: "spell",
  race: "Continuous",
  desc: 'When this card is activated: Add 1 "Primite" card from your Deck to your hand, except "Primite Lordly Lode". You can only use each effect of "Primite Lordly Lode" once per turn.',
});
const salvation = C({
  id: 95477924,
  name: "Magician's Salvation",
  type: "Spell Card",
  frameType: "spell",
  race: "Field",
  desc: 'When this card is activated: You can Set 1 "Eternal Soul" directly from your Deck.',
});
const pole = C({ id: 1, name: "Mystical Elf", type: "Normal Monster", desc: "Normal.", frameType: "normal", atk: 800, def: 2000, level: 4 });

const byId = new Map<number, CompactCard>([ash, belle, imperm, foolish, lode, salvation, pole].map((c) => [c.id, c]));

const cases: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, cond: boolean, detail?: string) {
  cases.push({ name, ok: cond, detail });
}

// 1) Belle cannot respond to Imperm
{
  const gate = parseResponseGate(belle, parseCard(belle)[0]!);
  const link = {
    id: "1",
    link: 1,
    player: "p2" as const,
    cardId: imperm.id,
    cardName: imperm.name,
    spellSpeed: 2 as const,
    kind: "trap",
    label: "Imperm",
    includes: ["target", "negate-effect"] as string[],
  };
  check("Belle vs Imperm blocked", evaluateResponse(belle, parseCard(belle)[0]!, link, imperm, "p1").ok === false);
  check("Ash vs Imperm blocked", evaluateResponse(ash, parseCard(ash)[0]!, link, imperm, "p1").ok === false);
  check("Belle gate exists", Boolean(gate?.includes.includes("ss-gy")));
}

// 2) Ash only vs deck includes
{
  const foolishLink = {
    id: "1",
    link: 1,
    player: "p1" as const,
    cardId: foolish.id,
    cardName: foolish.name,
    spellSpeed: 1 as const,
    kind: "spell",
    label: "Foolish",
    includes: ["send-deck-gy"] as string[],
  };
  check("Ash vs Foolish legal", evaluateResponse(ash, parseCard(ash)[0]!, foolishLink, foolish, "p2").ok === true);
  check("Belle vs Foolish illegal", evaluateResponse(belle, parseCard(belle)[0]!, foolishLink, foolish, "p2").ok === false);
}

// 3) Set Lode same turn
{
  let s = createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck(Array(40).fill(lode.id)) },
    p2: { name: "P2", deck: deck(Array(40).fill(pole.id)) },
    pve: { bot: "p2", premadeId: "generic", deckName: "Bot" },
  });
  s.phase = "M1";
  s.fetBox = "yellow";
  s.players.p1.spells[0] = { ...z(lode.id, false), setTurn: s.turn };
  const opts = activationOptions(s, lode, s.players.p1.spells[0]!, "st", "p1", byId);
  check("Set Lode activatable same turn", opts.some((o) => o.mode === "card"));
}

// 4) Engine debug traces on chain
{
  let s = createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck(Array(40).fill(foolish.id)) },
    p2: { name: "P2", deck: deck(Array(40).fill(ash.id)) },
    startingHand: 1,
  });
  const h = s.players.p1.hand[0]!;
  s = reduce(s, {
    type: "CHAIN_ADD",
    player: "p1",
    cardId: h.cardId,
    cardName: "Foolish Burial",
    instanceId: h.instanceId,
    spellSpeed: 1,
    kind: "spell",
    label: "mill",
    includes: ["send-deck-gy"],
  });
  check("debugTrace records allow", Boolean(s.debugTrace?.some((t) => t.allowed && t.cardName === "Foolish Burial")));
  s = reduce(s, {
    type: "CHAIN_ADD",
    player: "p1",
    cardId: lode.id,
    cardName: "Primite Lordly Lode",
    spellSpeed: 1,
    kind: "spell",
    label: "illegal ss1 chain",
  });
  check("debugTrace records SS1 block", Boolean(s.debugTrace?.some((t) => !t.allowed && /SS1/.test(t.reason))));
}

// 5) Denial explainer
{
  let s = createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck(Array(40).fill(imperm.id)) },
    p2: { name: "P2", deck: deck(Array(40).fill(pole.id)) },
  });
  s.phase = "M1";
  s.players.p1.spells[0] = { ...z(imperm.id, false), setTurn: s.turn };
  const why = explainActivationDenial(s, imperm, s.players.p1.spells[0]!, "st", "p1", byId);
  check("explainer mentions trap set turn", why.some((w) => /Set/i.test(w)));
}

// 6) Bot does not activate set trap same turn; does activate set Lode
{
  let s = createGame({
    formatId: "advanced",
    startingPlayer: "p2",
    pve: { bot: "p2", premadeId: "generic", deckName: "Bot" },
    p1: { name: "You", deck: deck(Array(40).fill(pole.id)) },
    p2: { name: "Bot", deck: deck(Array(40).fill(pole.id)) },
  });
  s = { ...s, activePlayer: "p2", phase: "M1", turn: 1, startingPlayer: "p2", fetBox: "A" };
  const setTrap = { ...z(imperm.id, false), setTurn: 1 };
  s = {
    ...s,
    players: {
      ...s.players,
      p2: { ...s.players.p2, hand: [], monsters: [z(pole.id), null, null, null, null], spells: [setTrap, null, null, null, null] },
    },
  };
  const cards = new Map(byId);
  const dTrap = decideBot(s, cards, {});
  check(
    "bot will not activate set trap this turn",
    !(dTrap && dTrap.type === "dispatch" && dTrap.action.type === "PLAY" && dTrap.action.mode === "activate-st"),
    dTrap?.type === "dispatch" && dTrap.action.type === "PLAY" ? dTrap.action.mode : dTrap?.note,
  );

  const setLode = { ...z(lode.id, false), setTurn: 1 };
  s = {
    ...s,
    fetBox: "yellow",
    players: {
      ...s.players,
      p2: { ...s.players.p2, hand: [], monsters: [z(pole.id), null, null, null, null], spells: [setLode, null, null, null, null] },
    },
  };
  const dLode = decideBot(s, cards, {});
  check(
    "bot activates set Lode",
    Boolean(dLode && dLode.type === "dispatch" && dLode.action.type === "PLAY" && dLode.action.mode === "activate-st"),
    dLode?.note,
  );
}

// 7) Field spell activation options from hand
{
  let s = createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck(Array(40).fill(salvation.id)) },
    p2: { name: "P2", deck: deck(Array(40).fill(pole.id)) },
  });
  s.phase = "M1";
  s.fetBox = "A";
  s.players.p1.hand = [z(salvation.id)];
  const opts = activationOptions(s, salvation, s.players.p1.hand[0]!, "hand", "p1", byId);
  check("Field Spell activatable from hand", opts.some((o) => o.mode === "card"));
}

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name, c.detail ?? "");
  }
}
if (fail) {
  console.error(fail, "debug/parity checks failed");
  process.exit(1);
}
console.log(`ok — ${cases.length} debug / parity checks`);
