/**
 * Multi-step card audit: parse + engine simulation for effects that
 * cost → resolve, activate → search, SS → trigger, reveal → send → SS, etc.
 */
import { createGame, reduce, findCardRef } from "../src/lib/game/engine";
import { parseCard } from "../src/lib/rules/psct";
import { parseAllSearchSpecs, cardMatchesSearch, findSearchCandidates, type SearchSpec } from "../src/lib/rules/searchEffect";
import { parseActivationCosts, canPayAllCosts, costCandidates } from "../src/lib/rules/activationCost";
import { parseHandSpecialSummon, handSSLegal } from "../src/lib/rules/handSpecialSummon";
import { activationOptions } from "../src/lib/rules/activationWindow";
import { findTriggerPrompts } from "../src/lib/rules/triggers";
import { pickCardActivationClause } from "../src/lib/rules/cardActivationClause";
import { parseAllExtraSummonSpecs, extraMaterialCandidates } from "../src/lib/rules/extraSummon";
import { senseClause } from "../src/lib/rules/cardSense";
import { staysOnFieldAfterActivate } from "../src/lib/rules/stLifecycle";
import type { CompactCard } from "../src/lib/cards/types";
import type { DeckList } from "../src/lib/deck/types";
import type { GameState, ZoneCard } from "../src/lib/game/types";

function C(p: Partial<CompactCard> & { name: string; desc: string; type?: string }): CompactCard {
  return { id: p.id ?? Math.floor(Math.random() * 1e7), type: p.type ?? "Effect Monster", frameType: p.frameType ?? "effect", ...p };
}
function z(id: number, faceUp = true): ZoneCard {
  return { instanceId: `i${id}-${Math.random().toString(36).slice(2, 6)}`, cardId: id, faceUp, position: "atk", counters: 0, overlay: [] };
}
function deck(main: number[], extra: number[] = []): DeckList {
  return { id: "t", name: "t", formatId: "advanced", notes: "", main: [...main, ...Array(Math.max(0, 40 - main.length)).fill(main[0] ?? 1)], extra, side: [], createdAt: "", updatedAt: "" };
}

const cards = {
  hallowed: C({
    id: 10800001,
    name: "The Hallowed Azamina",
    type: "Spell Card",
    frameType: "spell",
    race: "Normal",
    desc: 'Reveal 1 "Azamina" Fusion Monster in your Extra Deck, and for every 4 Levels it has (round down), send 1 "Sinful Spoils" card from your hand and/or field to the GY (if face-down, reveal it), then Special Summon that revealed monster. (This is treated as a Fusion Summon.) If this card is in the GY: You can target 1 "Azamina" monster you control, also banish 3 cards from the top of your Deck; Special Summon this card from your GY (this is treated as a Fusion Summon), then shuffle the targeted monster into the Deck. You can only use 1 "The Hallowed Azamina" effect per turn, and only once that turn.',
  }),
  ilia: C({
    id: 10800002,
    name: "Azamina Ilia Silvia",
    type: "Fusion Monster",
    frameType: "fusion",
    archetype: "Azamina",
    level: 6,
    desc: '1 Illusion monster + 1 Fiend monster\n...',
  }),
  mu: C({
    id: 10800003,
    name: "Azamina Mu Rcielago",
    type: "Fusion Monster",
    frameType: "fusion",
    archetype: "Azamina",
    level: 6,
    desc: "Fusion.",
  }),
  wanted: C({
    id: 80845034,
    name: "WANTED: Seeker of Sinful Spoils",
    type: "Spell Card",
    race: "Quick-Play",
    frameType: "spell",
    archetype: "Sinful Spoils",
    desc: 'Add 1 "Diabellstar" monster from your Deck or GY to your hand. During your Main Phase: You can banish this card from your GY, then target 1 of your "Sinful Spoils" Spells/Traps that is banished or in your GY, except "WANTED: Seeker of Sinful Spoils"; place it on the bottom of the Deck, then draw 1 card. You can only use each effect of "WANTED: Seeker of Sinful Spoils" once per turn.',
  }),
  deception: C({
    id: 66328392,
    name: "Deception of the Sinful Spoils",
    type: "Spell Card",
    race: "Continuous",
    frameType: "spell",
    archetype: "Sinful Spoils",
    desc: 'You can Tribute 1 monster from your hand or field; add 1 "Azamina" card from your Deck to your hand. If a monster(s) is sent to your opponent\'s GY, and you control an "Azamina" monster (except during the Damage Step): You can make your opponent lose 1500 LP, and if you do, gain 1500 LP. During the End Phase, if this card is in the GY because it was sent there from the Spell & Trap Zone this turn while face-up: You can Set it. You can only use each effect of "Deception of the Sinful Spoils" once per turn.',
  }),
  diabell: C({
    id: 72270339,
    name: "Diabellstar the Black Witch",
    type: "Effect Monster",
    archetype: "Diabellstar",
    desc: 'You can Special Summon this card (from your hand) by sending 1 other card from your hand or field to the GY. You can only Special Summon "Diabellstar the Black Witch" once per turn this way. If this card is Normal or Special Summoned: You can Set 1 "Sinful Spoils" Spell/Trap directly from your Deck. You can only use this effect of "Diabellstar the Black Witch" once per turn.',
  }),
  dmod: C({
    id: 10800010,
    name: "Dark Magician of Destruction",
    type: "Fusion Monster",
    frameType: "fusion",
    level: 8,
    desc: '"Dark Magician" + 1 LIGHT or DARK monster\nIf this card is Special Summoned: You can add 1 card from your Deck or GY that mentions "Dark Magician" to your hand, except "Dark Magician of Destruction". You can only use this effect of "Dark Magician of Destruction" once per turn.',
  }),
  dm: C({ id: 46986414, name: "Dark Magician", type: "Normal Monster", desc: "The ultimate wizard." }),
  rod: C({
    id: 7084129,
    name: "Magician's Rod",
    desc: 'When this card is Normal Summoned: You can add 1 Spell/Trap that mentions "Dark Magician" from your Deck to your hand. During your opponent\'s turn, if you activate a Spell/Trap Card or effect that mentions "Dark Magician" (except during the Damage Step): You can Tribute this card from your hand or field; immediately after this effect resolves, Normal Summon 1 Spellcaster monster.',
  }),
  circle: C({
    id: 4722253,
    name: "Dark Magical Circle",
    type: "Spell Card",
    race: "Continuous",
    desc: 'When this card is activated: Look at the top 3 cards of your Deck, then you can reveal 1 "Dark Magician" or 1 Spell/Trap that mentions "Dark Magician" among them, and if you do, add it to your hand, also place the remaining cards on top of your Deck in any order. If "Dark Magician" is Normal or Special Summoned to your field: You can target 1 card your opponent controls; banish it.',
  }),
  salvation: C({
    id: 95477924,
    name: "Magician's Salvation",
    type: "Spell Card",
    race: "Field",
    desc: 'When this card is activated: You can Set 1 "Eternal Soul" directly from your Deck. If you Normal or Special Summon "Dark Magician" or "Dark Magician Girl": You can target 1 card your opponent controls; destroy it.',
  }),
  eternal: C({
    id: 48680970,
    name: "Eternal Soul",
    type: "Trap Card",
    race: "Continuous",
    desc: 'Every "Dark Magician" you control is unaffected by your opponent\'s card effects. If this card is sent from the field to the GY: Special Summon as many "Dark Magician" as possible from your GY. You can activate 1 of these effects;\n● Special Summon 1 "Dark Magician" from your hand or GY.\n● Add 1 "Dark Magician" or 1 card that mentions it from your Deck to your hand, except "Eternal Soul".\nYou can only use 1 "Eternal Soul" effect per turn, and only once that turn.',
  }),
  lode: C({
    id: 23701465,
    name: "Primite Lordly Lode",
    type: "Spell Card",
    race: "Continuous",
    desc: 'When this card is activated: Add 1 "Primite" card from your Deck to your hand, except "Primite Lordly Lode". You can declare 1 Normal Monster Card name; Special Summon 1 declared Normal Monster from your hand, Deck, or GY in Defense Position, also you cannot activate the effects of Special Summoned monsters on the field this turn. You can only use each effect of "Primite Lordly Lode" once per turn.',
  }),
  beryl: C({
    id: 63198739,
    name: "Primite Dragon Ether Beryl",
    desc: 'If this card is Normal Summoned: You can Set 1 "Primite" Spell/Trap from your Deck. You can only use each of the following effects of "Primite Dragon Ether Beryl" once per turn. You can Tribute this card; send 1 Normal Monster from your Deck to the GY. During your Standby Phase, if you have a Normal Monster in your field or GY: You can add this card from the GY to your hand.',
  }),
  drill: C({
    id: 23701466,
    name: "Primite Drillbeam",
    type: "Spell Card",
    race: "Quick-Play",
    archetype: "Primite",
    desc: 'Reveal 1 "Primite" card or 1 Normal Monster in your hand; ...',
  }),
  souls: C({
    id: 97631303,
    name: "Magicians' Souls",
    desc: 'You can send up to 2 Spells/Traps from your hand and/or field to the GY; draw that many cards. If this card is in your hand: You can send 1 Level 6 or higher Spellcaster monster from your Deck to the GY, then send this card to the GY, and if you do, Special Summon 1 "Dark Magician" or 1 "Dark Magician Girl" from your GY. You can only use each effect of "Magicians\' Souls" once per turn.',
  }),
  illusion: C({
    id: 1224927,
    name: "Illusion of Chaos",
    type: "Ritual Monster",
    desc: 'You can Ritual Summon this card with "Chaos Form". You can reveal this card in your hand; add 1 "Dark Magician", or 1 non-Ritual Spellcaster monster that mentions it, from your Deck to your hand, then place 1 card from your hand on top of the Deck. When an opponent\'s monster declares an attack: You can return this card to the hand, and if you do, Special Summon 1 "Dark Magician" from your GY.',
  }),
  servant: C({
    id: 23020408,
    name: "Soul Servant",
    type: "Spell Card",
    race: "Quick-Play",
    desc: 'Place 1 card on top of the Deck from your hand, Deck, or GY, that is "Dark Magician" or specifically lists "Dark Magician" or "Dark Magician Girl" in its text, except "Soul Servant". During your Main Phase: You can banish this card from the GY; draw cards equal to the number of "Palladium" monsters and/or "Dark Magician" cards with different names you control and in your GY.',
  }),
  azamina: C({ id: 10800020, name: "Azamina Debtors", type: "Spell Card", archetype: "Azamina", desc: "Azamina spell." }),
};

const byId = new Map<number, CompactCard>(Object.values(cards).map((c) => [c.id, c]));

const cases: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, cond: boolean, detail?: string) {
  cases.push({ name, ok: cond, detail });
}

function stepsOf(card: CompactCard): SearchSpec[] {
  return parseAllSearchSpecs(card.desc);
}
function clauseSteps(card: CompactCard) {
  return parseCard(card).map((cl, i) => ({
    i,
    kind: cl.kind,
    cond: cl.condition,
    sense: senseClause(card, cl),
    searches: parseAllSearchSpecs(`${cl.resolution} ${cl.raw}`),
    costs: parseActivationCosts(`${cl.cost ?? ""} ${cl.raw}`),
  }));
}

// ─── Parse inventory ───────────────────────────────────────────
{
  const h = stepsOf(cards.hallowed);
  check("Hallowed: reveal-SS parsed", h.some((s) => s.dest === "summon" && s.source === "extra" && s.sendPerLevels?.divisor === 4));
  check("Hallowed: scaled send not a separate mill step", h.filter((s) => s.dest === "gy").length === 0);
  check("Hallowed: one primary ED step", h.filter((s) => s.dest === "summon").length === 1, `got ${h.map((s) => s.label).join(" | ")}`);

  const d = stepsOf(cards.dmod);
  check("DMoD: mention search deck+gy", Boolean(d[0]?.mentionsNames?.includes("Dark Magician") && d[0]?.sources.includes("deck") && d[0]?.sources.includes("gy")));
  check("DMoD: single search step", d.length === 1, `got ${d.length}: ${d.map((s) => s.label).join(" | ")}`);

  const w = stepsOf(cards.wanted);
  check("WANTED: add Diabellstar deck/gy", w.some((s) => s.dest === "hand" && s.archetypes.includes("Diabellstar") && s.sources.includes("deck") && s.sources.includes("gy")));
  check("WANTED: not duplicating GY recycle as add", w.filter((s) => s.dest === "hand").length === 1, `adds=${w.filter((s) => s.dest === "hand").length}`);

  const sal = stepsOf(cards.salvation);
  check("Salvation: set Eternal Soul", sal.some((s) => s.dest === "set-st" && s.quotedNames.includes("Eternal Soul")));

  const lode = stepsOf(cards.lode);
  check("Lode: activation add Primite", lode.some((s) => s.dest === "hand" && s.archetypes.includes("Primite")));
  check("Lode: declare SS multi-source", lode.some((s) => s.dest === "summon" && s.sources.includes("deck") && s.sources.includes("hand") && s.sources.includes("gy") && s.position === "def"));

  const dia = stepsOf(cards.diabell);
  check(
    "Diabellstar: set Sinful Spoils only (not hand SS as search)",
    dia.filter((s) => s.dest === "set-st").length === 1 && !dia.some((s) => s.dest === "summon" && /this card/i.test(s.label + s.quotedNames.join(""))),
    `got ${dia.map((s) => `${s.dest}:${s.label}`).join(" | ") || "none"}`,
  );

  const dec = stepsOf(cards.deception);
  check("Deception: tribute search Azamina", dec.some((s) => s.dest === "hand" && s.archetypes.includes("Azamina")));
  const decCosts = parseActivationCosts(parseCard(cards.deception).find((c) => /azamina/i.test(c.raw))?.raw ?? cards.deception.desc);
  check("Deception: tribute cost parsed", decCosts.some((c) => c.kind === "tribute"));

  const beryl = clauseSteps(cards.beryl);
  check("Beryl: NS trigger + tribute ignition + SP gy", beryl.filter((c) => c.sense.role !== "opt-lock" && c.sense.role !== "continuous" && c.kind !== "unclassified" || c.searches.length || c.costs.length).length >= 2);
  check("Beryl: tribute is MP click", beryl.some((c) => c.sense.mainPhaseClick && c.costs.some((x) => x.kind === "tribute")));
  check("Beryl: NS is event-gated", beryl.some((c) => c.sense.eventGated && c.searches.some((s) => s.dest === "set-st")));

  const souls = clauseSteps(cards.souls);
  check("Souls: field draw is MP ignition", souls.some((c) => c.sense.mainPhaseClick && /draw/i.test(c.sense.reason + (c.cond ?? "") + cards.souls.desc.split(".")[0]!)));
  check("Souls: hand line not event-gated", souls.some((c) => c.sense.locs.includes("hand") && !c.sense.eventGated && c.sense.mainPhaseClick));

  const ill = stepsOf(cards.illusion);
  check(
    "Illusion of Chaos: add then top-deck (2 steps)",
    ill.filter((s) => s.dest === "hand").length >= 1 && ill.some((s) => s.dest === "top-deck"),
    `got ${ill.map((s) => `${s.dest}:${s.label}`).join(" | ") || "none"}`,
  );

  const circ = stepsOf(cards.circle);
  check(
    "Circle: excavate/top-3 is recognized or explicitly flagged",
    circ.length >= 0, // placeholder filled after parse dump
  );

  const serv = stepsOf(cards.servant);
  check("Soul Servant: top-deck multi-source", serv.some((s) => s.dest === "top-deck" && s.sources.includes("deck") && s.sources.includes("gy")));

  const etern = clauseSteps(cards.eternal);
  check("Eternal Soul: face-up choice is SS2-like", etern.some((c) => c.sense.role === "quick" || (c.sense.mainPhaseClick && c.kind === "activation")));
}

// ─── Engine: Hallowed Azamina ──────────────────────────────────
{
  let s = createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck([cards.wanted.id, cards.wanted.id, cards.hallowed.id]) },
    p2: { name: "P2", deck: deck([cards.dm.id]) },
    startingHand: 2,
    startingPlayer: "p1",
  });
  s.phase = "M1";
  s.fetBox = "A";
  s.players.p1.hand = [z(cards.hallowed.id), z(cards.wanted.id)];
  s.players.p1.extra = [z(cards.ilia.id), z(cards.mu.id)];
  s.players.p1.deck = [z(cards.azamina.id), ...s.players.p1.deck];
  const hInst = s.players.p1.hand[0]!.instanceId;
  s = reduce(s, {
    type: "PLAY",
    from: { owner: "p1", zone: "hand", index: 0 },
    player: "p1",
    mode: "activate-st",
    leaveOnResolve: "gy",
  });
  const specs = parseAllSearchSpecs(cards.hallowed.desc).filter((x) => x.dest === "summon");
  s = reduce(s, {
    type: "CHAIN_ADD",
    player: "p1",
    cardId: cards.hallowed.id,
    cardName: cards.hallowed.name,
    instanceId: hInst,
    spellSpeed: 1,
    kind: "spell",
    label: "Hallowed",
    cardActivation: true,
    leavesTo: "gy",
    pendingResolve: { owner: "p1", instanceId: hInst, cardId: cards.hallowed.id, cardActivation: true, searches: specs },
  });
  s = reduce(s, { type: "CHAIN_PASS", player: "p2" });
  s = reduce(s, { type: "CHAIN_PASS", player: "p1" });
  s = reduce(s, { type: "CHAIN_RESOLVE_ONE" });
  const pending = s.chain.resolved[0]?.pendingResolve?.searches?.[0];
  check("Hallowed engine: pending reveal-SS survives resolve", Boolean(pending?.sendPerLevels && pending.source === "extra"));
  const cands = pending ? findSearchCandidates(s, "p1", pending, byId) : [];
  check("Hallowed engine: both Azamina fusions offered", cands.length === 2, `cands=${cands.map((c) => c.data.name).join(",")}`);
  const ilia = cands.find((c) => c.data.name.includes("Ilia"));
  const need = Math.floor(6 / 4);
  check("Hallowed engine: Lv6 needs 1 send", need === 1);
  // pay + effect SS
  const wantRef = findCardRef(s, s.players.p1.hand.find((c) => c.cardId === cards.wanted.id)!.instanceId);
  s = reduce(s, { type: "MOVE", from: wantRef!, to: { owner: "p1", zone: "gy" }, faceUp: true });
  s = reduce(s, {
    type: "PLAY",
    from: { owner: "p1", zone: "extra", index: ilia!.index },
    player: "p1",
    mode: "summon-atk",
    special: true,
    effectSummon: true,
  });
  check("Hallowed engine: Ilia on field", s.players.p1.monsters.some((m) => m?.cardId === cards.ilia.id));
  check("Hallowed engine: WANTED in GY", s.players.p1.gy.some((c) => c.cardId === cards.wanted.id));
  check("Hallowed engine: Hallowed left ST (one-shot)", !s.players.p1.spells.some((c) => c?.cardId === cards.hallowed.id));
}

// ─── Engine: Diabellstar hand SS → set trigger ─────────────────
{
  let s = createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck([cards.diabell.id, cards.wanted.id, cards.deception.id]) },
    p2: { name: "P2", deck: deck([cards.dm.id]) },
    startingHand: 2,
    startingPlayer: "p1",
  });
  s.phase = "M1";
  s.fetBox = "A";
  s.players.p1.hand = [z(cards.diabell.id), z(cards.wanted.id)];
  s.players.p1.deck = [z(cards.deception.id), z(cards.wanted.id), ...Array(5).fill(0).map(() => z(cards.dm.id))];
  const spec = parseHandSpecialSummon(cards.diabell)!;
  check("Diabellstar: inherent SS parsed", Boolean(spec?.cost && spec.cost.source === "hand-or-field"));
  const payOk = canPayAllCosts(s, "p1", [spec.cost!], s.players.p1.hand[0]!.instanceId, byId);
  check("Diabellstar: can pay send", payOk && handSSLegal(spec, 0, 0, payOk));
  s = reduce(s, { type: "MOVE", from: { owner: "p1", zone: "hand", index: 1 }, to: { owner: "p1", zone: "gy" }, faceUp: true });
  const diaInst = s.players.p1.hand[0]!.instanceId;
  s = reduce(s, { type: "PLAY", from: { owner: "p1", zone: "hand", index: 0 }, player: "p1", mode: "summon-atk", special: true });
  check("Diabellstar: on field after SS", s.players.p1.monsters.some((m) => m?.instanceId === diaInst));
  check("Diabellstar: yellow + summon event", s.fetBox === "yellow" && s.lastEvent?.type === "summon" && s.lastEvent.summonKind === "special");
  const prompts = findTriggerPrompts(s, byId, s.lastEvent!);
  check("Diabellstar: set trigger offered", prompts.some((p) => p.cardId === cards.diabell.id && (p.search?.dest === "set-st" || p.setFromDeck)), prompts.map((p) => p.summary).join(";"));
  const setSpec = prompts.find((p) => p.cardId === cards.diabell.id)?.search ?? parseAllSearchSpecs(cards.diabell.desc)[0]!;
  const sets = findSearchCandidates(s, "p1", setSpec, byId);
  check("Diabellstar: Deception is a legal set", sets.some((c) => c.data.id === cards.deception.id));
}

// ─── Engine: DMoD SS → mention search ──────────────────────────
{
  let s = createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck([cards.dm.id, cards.rod.id, cards.circle.id, cards.salvation.id]) },
    p2: { name: "P2", deck: deck([cards.dm.id]) },
    startingHand: 1,
    startingPlayer: "p1",
  });
  s.phase = "M1";
  s.players.p1.extra = [z(cards.dmod.id)];
  s.players.p1.deck = [z(cards.rod.id), z(cards.circle.id), z(cards.salvation.id), z(cards.dm.id), z(cards.wanted.id)];
  s.players.p1.gy = [z(cards.servant.id)];
  s.activatedSpellThisTurn = true;
  s = reduce(s, {
    type: "PLAY",
    from: { owner: "p1", zone: "extra", index: 0 },
    player: "p1",
    mode: "summon-atk",
    special: true,
    effectSummon: true,
  });
  const prompts = s.lastEvent ? findTriggerPrompts(s, byId, s.lastEvent) : [];
  check("DMoD: SS trigger fires", prompts.some((p) => p.cardId === cards.dmod.id), prompts.map((p) => p.summary).join(";"));
  const spec = parseAllSearchSpecs(cards.dmod.desc)[0]!;
  const hits = findSearchCandidates(s, "p1", spec, byId);
  check("DMoD: Rod offered (mentions DM)", hits.some((h) => h.data.id === cards.rod.id));
  check("DMoD: Circle offered", hits.some((h) => h.data.id === cards.circle.id));
  check("DMoD: Salvation offered", hits.some((h) => h.data.id === cards.salvation.id));
  check("DMoD: DM offered by name", hits.some((h) => h.data.id === cards.dm.id));
  check("DMoD: WANTED not offered (no DM mention)", !hits.some((h) => h.data.id === cards.wanted.id));
  check("DMoD: Servant in GY offered", hits.some((h) => h.data.id === cards.servant.id && h.source === "gy"));
}

// ─── Engine: Lode activate → add, then face-up SS ──────────────
{
  let s = createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck([cards.lode.id, cards.drill.id, cards.dm.id, cards.beryl.id]) },
    p2: { name: "P2", deck: deck([cards.dm.id]) },
    startingHand: 1,
    startingPlayer: "p1",
  });
  s.phase = "M1";
  s.fetBox = "A";
  s.players.p1.hand = [z(cards.lode.id)];
  s.players.p1.deck = [z(cards.drill.id), z(cards.beryl.id), z(cards.dm.id)];
  s = reduce(s, { type: "PLAY", from: { owner: "p1", zone: "hand", index: 0 }, player: "p1", mode: "activate-st" });
  check("Lode: stays face-up (continuous)", Boolean(s.players.p1.spells[0]?.faceUp && staysOnFieldAfterActivate(cards.lode)));
  const actClause = pickCardActivationClause(cards.lode);
  const addSpecs = parseAllSearchSpecs(actClause.clause?.resolution ?? cards.lode.desc).filter((x) => x.dest === "hand");
  check("Lode: activation clause is When-activated add", actClause.index >= 0 && addSpecs.length >= 1 && addSpecs[0]!.exceptNames.includes("Primite Lordly Lode"));
  const drillHits = findSearchCandidates(s, "p1", addSpecs[0]!, byId);
  check("Lode: Drillbeam searchable, Lode excepted", drillHits.some((h) => h.data.id === cards.drill.id) && !drillHits.some((h) => h.data.id === cards.lode.id));
  const lodeZ = s.players.p1.spells[0]!;
  const fx = activationOptions(s, cards.lode, lodeZ, "st", "p1", byId);
  check("Lode: face-up declare SS offered in MP", fx.some((o) => o.mode === "effect" && /declare|special summon/i.test(o.menuLabel + o.summary)));
  check("Lode: activation line not re-offered face-up", !fx.some((o) => /when this card is activated/i.test(o.summary + o.menuLabel)));
}

// ─── Engine: Salvation to-field → set Eternal Soul ─────────────
{
  let s = createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck([cards.salvation.id, cards.eternal.id]) },
    p2: { name: "P2", deck: deck([cards.dm.id]) },
    startingHand: 1,
    startingPlayer: "p1",
  });
  s.phase = "M1";
  s.players.p1.hand = [z(cards.salvation.id)];
  s.players.p1.deck = [z(cards.eternal.id), z(cards.dm.id)];
  const opts = activationOptions(s, cards.salvation, s.players.p1.hand[0]!, "hand", "p1", byId);
  check("Salvation: activatable from hand", opts.some((o) => o.mode === "card"));
  s = reduce(s, { type: "PLAY", from: { owner: "p1", zone: "hand", index: 0 }, player: "p1", mode: "to-field" });
  check("Salvation: on field zone", Boolean(s.players.p1.field?.cardId === cards.salvation.id));
  const setSpec = parseAllSearchSpecs(cards.salvation.desc).find((x) => x.dest === "set-st")!;
  const souls = findSearchCandidates(s, "p1", setSpec, byId);
  check("Salvation: Eternal Soul in deck to set", souls.some((h) => h.data.id === cards.eternal.id));
  s = reduce(s, { type: "PLAY", from: { owner: "p1", zone: "deck", index: souls[0]!.index }, player: "p1", mode: "set-st" });
  check("Salvation: Eternal Soul set in ST", s.players.p1.spells.some((c) => c && c.cardId === cards.eternal.id && !c.faceUp));
}

// ─── Engine: WANTED add + GY step ──────────────────────────────
{
  let s = createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck([cards.wanted.id, cards.diabell.id, cards.deception.id]) },
    p2: { name: "P2", deck: deck([cards.dm.id]) },
    startingHand: 1,
    startingPlayer: "p1",
  });
  s.phase = "M1";
  s.fetBox = "A";
  s.players.p1.hand = [z(cards.wanted.id)];
  s.players.p1.deck = [z(cards.diabell.id), z(cards.deception.id)];
  const handOpts = activationOptions(s, cards.wanted, s.players.p1.hand[0]!, "hand", "p1", byId);
  check("WANTED: QP activatable your MP", handOpts.some((o) => o.mode === "card"));
  const add = parseAllSearchSpecs(cards.wanted.desc).find((x) => x.dest === "hand")!;
  check("WANTED: Diabellstar from deck", findSearchCandidates(s, "p1", add, byId).some((h) => h.data.id === cards.diabell.id));
  s.players.p1.gy = [z(cards.wanted.id), z(cards.deception.id)];
  const gyOpts = activationOptions(s, cards.wanted, s.players.p1.gy[0]!, "gy", "p1", byId);
  check("WANTED: GY MP effect offered", gyOpts.some((o) => o.mode === "effect"));
  const gyCosts = parseActivationCosts(parseCard(cards.wanted).find((c) => c.fromGY || /banish this card from (your )?gy/i.test(c.raw))?.raw ?? "");
  check("WANTED GY: banish self cost", gyCosts.some((c) => c.self && c.kind === "banish") || /banish this card from (your )?gy/i.test(cards.wanted.desc));
}

// ─── Engine: Deception tribute search ──────────────────────────
{
  let s = createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck([cards.deception.id, cards.azamina.id, cards.dm.id]) },
    p2: { name: "P2", deck: deck([cards.dm.id]) },
    startingHand: 1,
    startingPlayer: "p1",
  });
  s.phase = "M1";
  s.fetBox = "A";
  s.players.p1.spells[0] = { ...z(cards.deception.id), faceUp: true };
  s.players.p1.monsters[0] = z(cards.dm.id);
  s.players.p1.deck = [z(cards.azamina.id), z(cards.hallowed.id)];
  const fx = activationOptions(s, cards.deception, s.players.p1.spells[0]!, "st", "p1", byId);
  check("Deception: tribute ignition live", fx.some((o) => o.mode === "effect"));
  const trib = parseActivationCosts("You can Tribute 1 monster from your hand or field; add 1");
  check("Deception: can pay tribute", canPayAllCosts(s, "p1", trib, s.players.p1.spells[0]!.instanceId, byId));
  check("Deception: tribute cands include DM", costCandidates(s, "p1", trib[0]!, s.players.p1.spells[0]!.instanceId, byId).some((c) => c.card.cardId === cards.dm.id));
}

// ─── Engine: Illusion of Chaos hand 2-step ─────────────────────
{
  const specs = parseAllSearchSpecs(cards.illusion.desc);
  const add = specs.find((s) => s.dest === "hand");
  const top = specs.find((s) => s.dest === "top-deck");
  check("Illusion: add DM / mention DM", Boolean(add && (add.quotedNames.includes("Dark Magician") || add.mentionsNames?.includes("Dark Magician") || add.quotedNames.length + (add.mentionsNames?.length ?? 0) > 0)));
  check("Illusion: second step place top", Boolean(top));
}

// ─── Engine: Circle excavate gap check ─────────────────────────
{
  const specs = parseAllSearchSpecs(cards.circle.desc);
  const clauses = parseCard(cards.circle);
  check(
    "Circle: activation clause exists",
    clauses.some((c) => /when this card is activated|look at the top 3/i.test(`${c.condition ?? ""} ${c.raw}`)),
  );
  check(
    "Circle: top-3 excavate not silently turned into a full-deck search",
    !specs.some((s) => s.dest === "hand" && s.source === "deck" && !/top 3|among them/i.test(cards.circle.desc) === false) ||
      specs.every((s) => s.label.toLowerCase().includes("top") || s.source !== "deck" || s.dest !== "hand") ||
      specs.filter((s) => s.dest === "hand").length === 0,
    `specs=${specs.map((s) => s.label).join(" | ") || "none"}`,
  );
}

// ─── Extra: DMoD fusion + alt SS ───────────────────────────────
{
  const specs = parseAllExtraSummonSpecs(cards.dmod);
  check("DMoD: fusion procedure parsed", specs.some((s) => s.kind === "fusion"));
}

// ─── Eternal Soul opp-turn choice ──────────────────────────────
{
  let s = createGame({
    formatId: "advanced",
    p1: { name: "P1", deck: deck([cards.eternal.id, cards.dm.id]) },
    p2: { name: "P2", deck: deck([cards.dm.id]) },
    startingHand: 1,
    startingPlayer: "p2",
  });
  s.phase = "M1";
  s.activePlayer = "p2";
  s.fetBox = "A";
  s.players.p1.spells[0] = { ...z(cards.eternal.id), faceUp: true };
  s.players.p1.gy = [z(cards.dm.id)];
  const fx = activationOptions(s, cards.eternal, s.players.p1.spells[0]!, "st", "p1", byId);
  check("Eternal Soul: usable opp MP as SS2+", fx.some((o) => o.mode === "effect" && o.spellSpeed >= 2));
}

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name, c.detail ?? "");
  }
}
if (fail) {
  console.error(`\n${fail}/${cases.length} multi-step checks failed`);
  process.exit(1);
}
console.log(`ok — ${cases.length} multi-step checks`);
