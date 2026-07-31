import type { CompactCard } from "@/lib/cards/types";
import { isExtraDeckType } from "@/lib/cards/compact";
import { cardKind } from "@/lib/cards/kinds";
import { findCardRef } from "@/lib/game/engine";
import type { GameAction, GameState, PlayerId, ZoneCard } from "@/lib/game/types";
import { activationOptions } from "@/lib/rules/activationWindow";
import { isLegalChainResponseOpt } from "@/lib/rules/legalResponses";
import { recordTrace } from "@/lib/rules/activationDebug";
import { analyzeCard, isEndBoardName, isStarterName } from "./cardIntel";
import { comboStage, evaluateBoard } from "./boardEval";
import { pushBotThought } from "./thought";
import { planAttack } from "@/lib/rules/battle";
import { isMonster, isQuickPlaySpell, isSpell, isTrap } from "@/lib/rules/psct";
import { isFieldSpellCard } from "@/lib/rules/stLifecycle";
import { canNormalSummonOrSet, tributesForNormalSummon } from "@/lib/rules/summonRules";
import { canPayAllCosts, costCandidates } from "@/lib/rules/activationCost";
import { handSSLegal, parseHandSpecialSummon } from "@/lib/rules/handSpecialSummon";
import { autoPickExtraMaterials } from "@/lib/rules/extraSummon";
import type { TriggerPrompt } from "@/lib/rules/triggers";
import { botProfileFor } from "./profiles";
import type { BotProfile } from "./types";

export type BotIntent =
  | { type: "dispatch"; action: GameAction; note: string; effectKey?: string; why: string; plan?: string; board?: string }
  | { type: "prompt-yes"; note: string; why: string; plan?: string; board?: string }
  | { type: "prompt-no"; note: string; why: string; plan?: string; board?: string }
  | { type: "wait"; note: string; why: string; plan?: string; board?: string };

function nameOf(card: ZoneCard, byId: Map<number, CompactCard>) {
  return byId.get(card.cardId)?.name ?? card.name ?? "card";
}

function firstEmpty(slots: Array<ZoneCard | null>) {
  return slots.findIndex((s) => s === null);
}

function opp(id: PlayerId): PlayerId {
  return id === "p1" ? "p2" : "p1";
}

function normName(s: string) {
  return s.toLowerCase().replace(/['’]/g, "").trim();
}

function rankName(name: string, list: string[]) {
  const n = normName(name);
  const i = list.findIndex((x) => normName(x) === n);
  return i < 0 ? 999 : i;
}

function monstersOf(state: GameState, who: PlayerId) {
  return [...state.players[who].monsters.filter(Boolean)] as ZoneCard[];
}

function isFieldSpell(data: CompactCard) {
  return isFieldSpellCard(data);
}

function isContinuousOrEquip(data: CompactCard) {
  const r = data.race?.toLowerCase() ?? "";
  return r === "continuous" || r === "equip";
}

function goingFirstThisTurn(state: GameState, bot: PlayerId) {
  return state.turn === 1 && bot === state.startingPlayer;
}

function scoreResponse(data: CompactCard, top: { cardName: string; includes?: string[]; kind: string }, pri: number) {
  let s = Math.max(0, 30 - pri);
  const n = data.name.toLowerCase();
  const inc = top.includes ?? [];
  if (n.includes("ash blossom") && (inc.includes("add-deck-hand") || inc.includes("ss-deck") || inc.includes("send-deck-gy"))) s += 25;
  if (n.includes("ghost belle") && (inc.includes("ss-gy") || inc.includes("add-gy-hand") || inc.includes("banish-gy"))) s += 22;
  if (n.includes("called by")) s += 18;
  if (n.includes("imperm") || n.includes("veiler")) s += top.kind.includes("monster") || /monster|summon/i.test(top.cardName) ? 12 : 2;
  if (n.includes("droll")) s += inc.includes("add-deck-hand") ? 20 : -50;
  if (n.includes("nibiru")) s += 8;
  if (n.includes('maxx') || n.includes("fuwalos")) s += inc.includes("ss-deck") || inc.includes("ss-extra") || inc.includes("ss-gy") ? 16 : 6;
  return s;
}

function withThought(intent: BotIntent | null, plan: string, board: string): BotIntent | null {
  if (!intent) return null;
  const tagged = { ...intent, plan: intent.plan ?? plan, board: intent.board ?? board };
  pushBotThought({
    note: tagged.note,
    why: tagged.why,
    plan: tagged.plan ?? plan,
    board: tagged.board ?? board,
  });
  return tagged;
}

export function decideBot(
  state: GameState,
  byId: Map<number, CompactCard>,
  opts: { prompt?: TriggerPrompt | null; usedEffectKeys?: Set<string> },
): BotIntent | null {
  const pve = state.pve;
  if (!pve) return null;
  const bot = pve.bot;
  const profile = botProfileFor(pve.premadeId);
  const used = opts.usedEffectKeys ?? new Set<string>();
  const evaln = evaluateBoard(state, bot, byId, profile);
  const plan = comboStage(state, bot, byId, profile);
  const tag = (intent: BotIntent | null) => withThought(intent, plan, evaln.note);

  if (opts.prompt) {
    if (opts.prompt.owner !== bot) {
      return tag({ type: "wait", note: "Waiting for your activation window.", why: "Human optional/mandatory prompt is open." });
    }
    const takeOwn =
      opts.prompt.mandatory ||
      profile.acceptTriggers ||
      Boolean(opts.prompt.search) ||
      Boolean(opts.prompt.setFromDeck) ||
      /add |special summon|set 1 |draw /i.test(opts.prompt.summary);
    if (takeOwn) {
      return tag({ type: "prompt-yes", note: `Using ${opts.prompt.cardName}.`, why: `Line: ${plan}. Resolve own trigger.` });
    }
    return tag({ type: "prompt-no", note: `Skipping ${opts.prompt.cardName}.`, why: "Optional trigger declined by profile." });
  }

  if (state.chain.links.length) {
    if (state.chain.complete) return tag({ type: "wait", note: "Chain resolving.", why: "Both players passed; resolver is draining the chain." });
    if (state.chain.pendingPlayer !== bot) return tag({ type: "wait", note: "Waiting on chain.", why: "Not the bot's response window." });
    const top = state.chain.links.at(-1);
    if (top?.player === bot) {
      return tag({ type: "dispatch", action: { type: "CHAIN_PASS", player: bot }, note: "Pass on own chain.", why: "Will not Ash/handtrap its own card." });
    }
    const responder = pickResponder(state, byId, bot, profile, used);
    if (responder) {
      recordTrace({
        allowed: true,
        cardName: top?.cardName ? `response vs ${top.cardName}` : "response",
        player: bot,
        source: "bot",
        respondingTo: top?.cardName,
        reason: responder.why,
      });
      return tag(responder);
    }
    recordTrace({
      allowed: true,
      cardName: "Bot pass",
      player: bot,
      source: "bot",
      respondingTo: top?.cardName,
      reason: `${top?.cardName ?? "Chain link"} is legal and resolving — bot has no response.`,
    });
    return tag({ type: "dispatch", action: { type: "CHAIN_PASS", player: bot }, note: "Pass on chain.", why: "No legal fast effect to chain." });
  }

  if (state.activePlayer !== bot) return null;

  if (state.phase === "DP") {
    if (!state.drewThisTurn?.[bot]) {
      return { type: "dispatch", action: { type: "DRAW", player: bot, count: 1 }, note: "Draw 1.", why: "Draw Phase draw not taken yet." };
    }
    const dpFx = listPhaseEffects(state, byId, bot, profile, used);
    if (dpFx[0]) return dpFx[0]!;
    return { type: "dispatch", action: { type: "NEXT_PHASE" }, note: "Leave Draw Phase.", why: "Already drew (or opening skip)." };
  }

  if (state.phase === "SP") {
    const spFx = listPhaseEffects(state, byId, bot, profile, used);
    if (spFx[0]) return spFx[0]!;
    if (state.fetBox === "yellow" && botHasOpenTrigger(state, bot, byId)) {
      return { type: "wait", note: "Standby effects…", why: "Standby trigger window is open." };
    }
    return { type: "dispatch", action: { type: "NEXT_PHASE" }, note: "Leave Standby.", why: "No Standby Phase effects to use." };
  }

  if (state.phase === "M1" || state.phase === "M2") {
    if (state.fetBox === "yellow" && !state.chain.links.length && botHasOpenTrigger(state, bot, byId)) {
      const plays = listMainPlays(state, byId, bot, profile, used, state.phase, { comboOnly: true, plan });
      if (plays[0]) return tag(plays[0]!);
      const leftoverY = listMainPlays(state, byId, bot, profile, used, state.phase, { comboOnly: false, plan });
      if (leftoverY[0]) return tag(leftoverY[0]!);
      return tag({
        type: "dispatch",
        action: { type: "NEXT_PHASE" },
        note: "No fireable trigger — continue.",
        why: "Yellow window open but no legal bot activation; avoid soft-lock.",
      });
    }
    const plays = listMainPlays(state, byId, bot, profile, used, state.phase, { comboOnly: true, plan });
    if (plays[0]) return tag(plays[0]!);
    const leftover = listMainPlays(state, byId, bot, profile, used, state.phase, { comboOnly: false, plan });
    if (leftover[0]) return tag(leftover[0]!);
    return tag({
      type: "dispatch",
      action: { type: "NEXT_PHASE" },
      note: state.phase === "M1" ? `Combo done (${evaln.note}) — Battle.` : "No Main Phase 2 plays — end turn.",
      why: evaln.note,
    });
  }

  if (state.phase === "BP") {
    const bpFx = listPhaseEffects(state, byId, bot, profile, used);
    if (bpFx[0]) return bpFx[0]!;
    const battle = listBattlePlays(state, byId, bot);
    if (battle[0]) return battle[0]!;
    return {
      type: "dispatch",
      action: { type: "NEXT_PHASE" },
      note: goingFirstThisTurn(state, bot) ? "Cannot attack first turn — leave Battle." : "No profitable attacks — leave Battle.",
      why: goingFirstThisTurn(state, bot) ? "First turn of the duel." : "No unused ATK monster can make a safe attack.",
    };
  }

  if (state.phase === "EP") {
    const epFx = listPhaseEffects(state, byId, bot, profile, used);
    if (epFx[0]) return epFx[0]!;
    if (state.fetBox === "yellow" && botHasOpenTrigger(state, bot, byId)) {
      return { type: "wait", note: "End Phase effects…", why: "End Phase trigger window is open." };
    }
    return { type: "dispatch", action: { type: "NEXT_TURN" }, note: "Pass the turn.", why: "End Phase effects done." };
  }

  return { type: "dispatch", action: { type: "NEXT_PHASE" }, note: "Advance phase.", why: "Unknown phase fallback." };
}

/** Public: every main/battle intent the bot currently considers legal, best first. */
export function listLegalBotIntents(
  state: GameState,
  byId: Map<number, CompactCard>,
  opts: { usedEffectKeys?: Set<string> } = {},
): BotIntent[] {
  const pve = state.pve;
  if (!pve || state.activePlayer !== pve.bot) return [];
  const bot = pve.bot;
  const profile = botProfileFor(pve.premadeId);
  const used = opts.usedEffectKeys ?? new Set<string>();
  if (state.chain.links.length) return [];
  if (state.phase === "M1" || state.phase === "M2") return listMainPlays(state, byId, bot, profile, used, state.phase, { comboOnly: false });
  if (state.phase === "SP" || state.phase === "EP" || state.phase === "DP") return listPhaseEffects(state, byId, bot, profile, used);
  if (state.phase === "BP") return [...listPhaseEffects(state, byId, bot, profile, used), ...listBattlePlays(state, byId, bot)];
  return [];
}

const OPPONENT_ONLY_HANDTRAPS = [
  "ash blossom & joyous spring",
  "infinite impermanence",
  "effect veiler",
  'maxx "c"',
  "nibiru, the primal being",
  "droll & lock bird",
  "ghost belle & haunted mansion",
  "mulcharmy fuwalos",
  "crossout designator",
  "forbidden droplet",
  "called by the grave",
];

function isOpponentOnlyHandtrap(name: string) {
  return OPPONENT_ONLY_HANDTRAPS.includes(normName(name));
}

function pickResponder(
  state: GameState,
  byId: Map<number, CompactCard>,
  bot: PlayerId,
  profile: BotProfile,
  used: Set<string>,
): BotIntent | null {
  const top = state.chain.links.at(-1);
  if (!top || top.player === bot) return null;

  const me = state.players[bot];
  const pool = [...me.hand, ...me.monsters.filter(Boolean), ...me.spells.filter(Boolean), me.field].filter(Boolean) as ZoneCard[];
  const ranked: Array<{ card: ZoneCard; data: CompactCard; pri: number; loc: "hand" | "field" | "st"; opt: ReturnType<typeof activationOptions>[0] }> = [];

  for (const card of pool) {
    const data = byId.get(card.cardId);
    if (!data) continue;
    if (isOpponentOnlyHandtrap(data.name) && top.player === bot) continue;
    const ref = findCardRef(state, card.instanceId);
    const loc =
      ref?.zone === "hand" ? "hand" : ref?.zone === "monster" || ref?.zone === "emz" ? "field" : ref?.zone === "st" || ref?.zone === "field" ? "st" : null;
    if (!loc) continue;
    // Monster handtraps need a discard cost we don't fully simulate — never self-use, skip auto Ash/Veiler/etc.
    const where = loc === "hand" ? "hand" : loc === "field" ? "field" : "st";
    const opts = activationOptions(state, data, card, loc, bot, byId).filter((o) => isLegalChainResponseOpt(data, o, where));
    if (!opts.length) continue;
    const pri = rankName(data.name, profile.responders);
    if (pri >= 900) continue;
    const key = `resp:${card.instanceId}:${opts[0]!.clauseIndex}`;
    if (used.has(key)) continue;
    ranked.push({ card, data, pri, loc, opt: opts[0]! });
  }
  ranked.sort((a, b) => {
    const sa = scoreResponse(a.data, top!, a.pri);
    const sb = scoreResponse(b.data, top!, b.pri);
    if (sb !== sa) return sb - sa;
    return a.pri - b.pri;
  });
  const hit = ranked.find((r) => scoreResponse(r.data, top!, r.pri) > 0);
  if (!hit) return null;

  if (hit.opt.mode === "card" && (hit.loc === "hand" || hit.loc === "st")) {
    const ref = findCardRef(state, hit.card.instanceId);
    if (!ref) return null;
    return {
      type: "dispatch",
      action: {
        type: "PLAY",
        from: ref,
        player: bot,
        mode: "activate-st",
        leaveOnResolve: isTrap(hit.data) || isQuickPlaySpell(hit.data) ? "gy" : undefined,
      },
      note: `Chain ${hit.data.name}.`,
      why: "Opponent's chain link is up; a legal response is live.",
      effectKey: `resp:${hit.card.instanceId}:${hit.opt.clauseIndex}`,
    };
  }

  const negatesPrevious = /negate that (effect|activation)|negate the activation/.test(
    `${hit.opt.summary} ${hit.opt.menuLabel}`.toLowerCase(),
  );
  return {
    type: "dispatch",
    action: {
      type: "CHAIN_ADD",
      player: bot,
      cardId: hit.data.id,
      cardName: hit.data.name,
      instanceId: hit.card.instanceId,
      spellSpeed: hit.opt.spellSpeed,
      kind: hit.opt.kind,
      label: hit.opt.summary,
      clauseIndex: hit.opt.clauseIndex,
      negatesPrevious,
      clauseText: hit.opt.summary,
    },
    note: `Respond with ${hit.data.name}.`,
    why: negatesPrevious
      ? "Opponent's effect is legal to negate."
      : "Opponent's chain link is up; listed responder is live.",
    effectKey: `resp:${hit.card.instanceId}:${hit.opt.clauseIndex}`,
  };
}

function listPhaseEffects(
  state: GameState,
  byId: Map<number, CompactCard>,
  bot: PlayerId,
  _profile: BotProfile,
  used: Set<string>,
): BotIntent[] {
  const out: BotIntent[] = [];
  const me = state.players[bot];
  const consider = (card: ZoneCard, loc: "hand" | "field" | "st" | "gy") => {
    const data = byId.get(card.cardId);
    if (!data) return;
    if ((loc === "field" || loc === "st") && !card.faceUp) return;
    const opts = activationOptions(state, data, card, loc, bot, byId).filter((o) => o.mode === "effect" || (o.mode === "card" && loc === "hand"));
    for (const pick of opts) {
      if (pick.mode === "card") continue;
      const key = `fx:${card.instanceId}:${pick.clauseIndex}:${state.phase}`;
      if (used.has(key)) continue;
      if (state.chain.links.some((l) => l.instanceId === card.instanceId && l.clauseIndex === pick.clauseIndex)) continue;
      out.push({
        type: "dispatch",
        action: {
          type: "CHAIN_ADD",
          player: bot,
          cardId: data.id,
          cardName: data.name,
          instanceId: card.instanceId,
          spellSpeed: pick.spellSpeed,
          kind: pick.kind,
          label: pick.summary,
          clauseIndex: pick.clauseIndex,
          segoc: state.fetBox === "yellow" && pick.spellSpeed === 1,
        },
        note: `${state.phase}: use ${data.name}.`,
        why: pick.reason,
        effectKey: key,
      });
      return;
    }
  };
  for (const c of me.hand) consider(c, "hand");
  for (const c of monstersOf(state, bot)) consider(c, "field");
  for (const c of me.spells.filter(Boolean) as ZoneCard[]) consider(c, "st");
  if (me.field) consider(me.field, "st");
  for (const c of me.gy.slice(0, 8)) consider(c, "gy");
  return out;
}

function botHasOpenTrigger(state: GameState, bot: PlayerId, byId: Map<number, CompactCard>): boolean {
  const me = state.players[bot];
  for (const card of [...monstersOf(state, bot), ...me.spells.filter(Boolean), me.field].filter(Boolean) as ZoneCard[]) {
    const data = byId.get(card.cardId);
    if (!data || !card.faceUp) continue;
    const loc = me.spells.includes(card) || me.field === card ? "st" : "field";
    const opts = activationOptions(state, data, card, loc, bot, byId).filter((o) => o.mode === "effect" && (o.kind === "trigger" || o.kind === "flip"));
    if (opts.length) return true;
  }
  return false;
}

function isComboSpell(data: CompactCard, profile: BotProfile): boolean {
  if (isQuickPlaySpell(data) && !profile.engineSpells.some((n) => normName(n) === normName(data.name))) return false;
  if (rankName(data.name, profile.engineSpells) < 900) return true;
  const desc = data.desc.toLowerCase();
  if (/add .{2,80} from your deck|fusion summon|ritual summon|special summon .{2,60} from your (deck|extra deck|gy|hand)/i.test(data.desc)) {
    return true;
  }
  const keys = [...profile.engineSpells, ...profile.normalSummon, ...profile.endBoard, profile.name]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5);
  const blob = `${data.name} ${desc}`.toLowerCase();
  return keys.some((k) => blob.includes(k));
}

function listMainPlays(
  state: GameState,
  byId: Map<number, CompactCard>,
  bot: PlayerId,
  profile: BotProfile,
  used: Set<string>,
  phase: "M1" | "M2",
  playOpts: { comboOnly: boolean; plan?: string },
): BotIntent[] {
  const out: BotIntent[] = [];
  const me = state.players[bot];
  const second = !goingFirstThisTurn(state, bot);
  const plan = playOpts.plan;

  // 0a) Activate Set Normal/Continuous/Equip/Field Spells (e.g. Beryl Sets Lordly Lode).
  for (const card of [...me.spells.filter(Boolean), me.field].filter(Boolean) as ZoneCard[]) {
    const data = byId.get(card.cardId);
    if (!data || card.faceUp) continue;
    if (!isSpell(data) || isQuickPlaySpell(data)) continue;
    const ref = findCardRef(state, card.instanceId);
    if (!ref) continue;
    const opts = activationOptions(state, data, card, "st", bot, byId);
    if (!opts.some((o) => o.mode === "card")) continue;
    const key = `play:${card.instanceId}`;
    if (used.has(key)) continue;
    out.push({
      type: "dispatch",
      action: {
        type: "PLAY",
        from: ref,
        player: bot,
        mode: isFieldSpell(data) ? "to-field" : "activate-st",
        leaveOnResolve: isContinuousOrEquip(data) || isFieldSpell(data) ? undefined : "gy",
      },
      note: `Activate Set ${data.name}.`,
      why: `Plan ${plan ?? "extend"}: flip engine/continuous spell.`,
      effectKey: key,
    });
  }

  // 0b) Face-up field / ST effects first (continue the combo)
  for (const card of [...monstersOf(state, bot), ...me.spells.filter(Boolean), me.field].filter(Boolean) as ZoneCard[]) {
    const data = byId.get(card.cardId);
    if (!data || !card.faceUp) continue;
    const ref = findCardRef(state, card.instanceId);
    const loc = ref?.zone === "monster" || ref?.zone === "emz" ? "field" : "st";
    const fx = activationOptions(state, data, card, loc, bot, byId).filter((o) => o.mode === "effect");
    const pick =
      fx.find((o) => o.kind === "ignition") ??
      (state.fetBox === "yellow" ? fx.find((o) => o.kind === "trigger" || o.kind === "flip") : undefined) ??
      fx.find((o) => o.kind === "activation") ??
      fx.find((o) => o.kind === "quick");
    if (!pick) continue;
    const key = `fx:${card.instanceId}:${pick.clauseIndex}`;
    if (used.has(key)) continue;
    if (state.chain.links.some((l) => l.instanceId === card.instanceId && l.clauseIndex === pick.clauseIndex)) continue;
    out.push({
      type: "dispatch",
      action: {
        type: "CHAIN_ADD",
        player: bot,
        cardId: data.id,
        cardName: data.name,
        instanceId: card.instanceId,
        spellSpeed: pick.spellSpeed,
        kind: pick.kind,
        label: pick.summary,
        clauseIndex: pick.clauseIndex,
        segoc: state.fetBox === "yellow" && pick.spellSpeed === 1,
      },
      note: `Use ${data.name}.`,
      why: `Plan ${plan ?? "extend"}: continue with ${pick.kind} — ${analyzeCard(data, profile).summary.slice(0, 80)}`,
      effectKey: key,
    });
  }

  // 1) Engine / searched combo spells
  const spells = me.hand
    .map((c) => ({ c, data: byId.get(c.cardId) }))
    .filter((x): x is { c: ZoneCard; data: CompactCard } => {
      if (!x.data) return false;
      return isSpell(x.data);
    });
  spells.sort((a, b) => rankName(a.data.name, profile.engineSpells) - rankName(b.data.name, profile.engineSpells));

  for (const { c, data } of spells) {
    if (used.has(`play:${c.instanceId}`)) continue;
    const engine = isComboSpell(data, profile);
    const breaker = second && rankName(data.name, profile.breakers) < 900;
    if (!engine && !breaker) continue;
    const opts = activationOptions(state, data, c, "hand", bot, byId);
    if (!opts.some((o) => o.mode === "card")) continue;
    const ref = findCardRef(state, c.instanceId);
    if (!ref) continue;
    if (isFieldSpell(data)) {
      out.push({
        type: "dispatch",
        action: { type: "PLAY", from: ref, player: bot, mode: "to-field" },
        note: `Activate Field ${data.name}.`,
        why: "Field Spell activation is legal in Main Phase.",
        effectKey: `play:${c.instanceId}`,
      });
      continue;
    }
    if (firstEmpty(me.spells) < 0 && !isFieldSpell(data)) continue;
    out.push({
      type: "dispatch",
      action: {
        type: "PLAY",
        from: ref,
        player: bot,
        mode: "activate-st",
        leaveOnResolve: isContinuousOrEquip(data) ? undefined : "gy",
      },
      note: `Activate ${data.name}.`,
      why: engine ? "Profile engine spell is live." : breaker ? "Going-second breaker is live." : "Generic starter spell is live.",
      effectKey: `play:${c.instanceId}`,
    });
  }

  // 2b) Inherent Special Summon from hand (Diabellstar, etc.)
  if (firstEmpty(me.monsters) >= 0) {
    for (const card of me.hand) {
      if (used.has(`handss:${card.instanceId}`)) continue;
      const data = byId.get(card.cardId);
      if (!data) continue;
      const spec = parseHandSpecialSummon(data);
      if (!spec) continue;
      const mine = me.monsters.filter(Boolean).length;
      const theirs = state.players[opp(bot)].monsters.filter(Boolean).length;
      const payOk = !spec.cost || canPayAllCosts(state, bot, [spec.cost], card.instanceId, byId);
      if (!handSSLegal(spec, mine, theirs, payOk)) continue;
      const ref = findCardRef(state, card.instanceId);
      if (!ref) continue;
      let materials: import("@/lib/game/types").ZoneRef[] | undefined;
      if (spec.cost) {
        const cands = costCandidates(state, bot, spec.cost, card.instanceId, byId).filter((c) => c.card.instanceId !== card.instanceId);
        if (cands.length < spec.cost.count) continue;
        materials = cands.slice(0, spec.cost.count).map((c) => c.ref);
      }
      out.push({
        type: "dispatch",
        action: { type: "PLAY", from: ref, player: bot, mode: "summon-atk", special: true, materials },
        note: `${spec.label} — ${data.name}.`,
        why: "Inherent Special Summon from hand is live.",
        effectKey: `handss:${card.instanceId}`,
      });
      break;
    }
  }

  // 3) Normal Summon / Set monster
  if (canNormalSummonOrSet(state, bot) && firstEmpty(me.monsters) >= 0) {
    const monsters = me.hand
      .map((c) => ({ c, data: byId.get(c.cardId) }))
      .filter((x): x is { c: ZoneCard; data: CompactCard } => {
        if (!x.data) return false;
        return isMonster(x.data) && !isExtraDeckType(x.data.type);
      })
      .filter((x) => {
        const need = tributesForNormalSummon(x.data);
        if (need < 0) return false;
        if (need === 0) return true;
        return me.monsters.filter(Boolean).length >= need;
      });
    monsters.sort((a, b) => {
      const ra = rankName(a.data.name, profile.normalSummon);
      const rb = rankName(b.data.name, profile.normalSummon);
      if (ra !== rb) return ra - rb;
      const la = a.data.level ?? 99;
      const lb = b.data.level ?? 99;
      if (la !== lb) return la - lb;
      return (b.data.atk ?? 0) - (a.data.atk ?? 0);
    });
    const hasEngineLive = me.hand.some((c) => {
      const d = byId.get(c.cardId);
      return d && isSpell(d) && isComboSpell(d, profile) && activationOptions(state, d, c, "hand", bot, byId).some((o) => o.mode === "card");
    });
    const pick =
      monsters.find((m) => rankName(m.data.name, profile.normalSummon) < 900) ??
      (playOpts.comboOnly || hasEngineLive ? undefined : monsters.find((m) => (m.data.level ?? 99) <= 4)) ??
      (playOpts.comboOnly ? undefined : monsters[0]);
    if (pick) {
      const ref = findCardRef(state, pick.c.instanceId);
      const need = tributesForNormalSummon(pick.data);
      const tributes = me.monsters
        .map((c, index) => (c ? ({ owner: bot, zone: "monster" as const, index } as const) : null))
        .filter(Boolean)
        .slice(0, Math.max(0, need)) as import("@/lib/game/types").ZoneRef[];
      if (ref && tributes.length === Math.max(0, need)) {
        out.push({
          type: "dispatch",
          action: { type: "PLAY", from: ref, player: bot, mode: "summon-atk", tributes },
          note: `Normal Summon ${pick.data.name}.`,
          why:
            need > 0
              ? `Tribute Summon is legal (${need} tribute${need > 1 ? "s" : ""} available).`
              : "Normal Summon is unused and a legal monster is in hand.",
        });
      }
    }
  }

  // 4) Extra Deck only with real materials (sent to GY)
  {
    const extras = me.extra
      .map((c) => ({ c, data: byId.get(c.cardId) }))
      .filter((x): x is { c: ZoneCard; data: CompactCard } => Boolean(x.data));
    extras.sort((a, b) => {
      const ea = isEndBoardName(a.data.name, profile) ? 0 : 1;
      const eb = isEndBoardName(b.data.name, profile) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      const ia = analyzeCard(a.data, profile).interaction;
      const ib = analyzeCard(b.data, profile).interaction;
      if (ib !== ia) return ib - ia;
      return rankName(a.data.name, profile.extraBosses) - rankName(b.data.name, profile.extraBosses);
    });
    for (const boss of extras) {
      if (used.has(`extra:${boss.c.instanceId}`)) continue;
      const preferred = rankName(boss.data.name, profile.extraBosses) < 900;
      if (!preferred && profile.extraAggression < 0.85) continue;
      const pick = autoPickExtraMaterials(state, bot, boss.data, byId);
      if (!pick?.refs.length) continue;
      const ref = findCardRef(state, boss.c.instanceId);
      if (!ref || ref.owner !== bot) continue;
      out.push({
        type: "dispatch",
        action: {
          type: "PLAY",
          from: ref,
          player: bot,
          mode: "summon-atk",
          special: true,
          materials: pick.refs,
          materialsMode: pick.spec.materialsMode ?? (cardKind(boss.data) === "xyz" ? "overlay" : "gy"),
        },
        note: `Extra Deck Summon ${boss.data.name}.`,
        why: `${pick.refs.length} legal material(s) — ${pick.spec.label}.`,
        effectKey: `extra:${boss.c.instanceId}`,
      });
      break;
    }
  }

  // 5) Set backrow only after combo plays are exhausted
  if (!playOpts.comboOnly && firstEmpty(me.spells) >= 0) {
    const sets = me.hand
      .map((c) => ({ c, data: byId.get(c.cardId) }))
      .filter((x): x is { c: ZoneCard; data: CompactCard } => {
        if (!x.data) return false;
        return isTrap(x.data) || isQuickPlaySpell(x.data);
      });
    sets.sort((a, b) => rankName(a.data.name, profile.setBackrow) - rankName(b.data.name, profile.setBackrow));
    const already = me.spells.filter(Boolean).length;
    const limit = phase === "M1" ? (second ? 1 : 2) : 3;
    if (already < limit) {
      const trap =
        sets.find((s) => rankName(s.data.name, profile.setBackrow) < 900) ??
        sets.find((s) => isTrap(s.data));
      if (trap && !used.has(`set:${trap.c.instanceId}`)) {
        const ref = findCardRef(state, trap.c.instanceId);
        if (ref) {
          out.push({
            type: "dispatch",
            action: { type: "PLAY", from: ref, player: bot, mode: "set-st" },
            note: `Set ${trap.data.name}.`,
            why: "Open S/T zone and a trap/QP is in hand.",
            effectKey: `set:${trap.c.instanceId}`,
          });
        }
      }
    }
  }

  return out;
}

function listBattlePlays(state: GameState, byId: Map<number, CompactCard>, bot: PlayerId): BotIntent[] {
  if (goingFirstThisTurn(state, bot)) return [];
  const out: BotIntent[] = [];
  const oppId = opp(bot);
  const defenders = state.players[oppId].monsters.filter((c): c is ZoneCard => Boolean(c));
  const attackers = monstersOf(state, bot)
    .filter((c) => c.faceUp && c.position === "atk" && !state.attackedThisTurn.includes(c.instanceId))
    .sort((a, b) => (byId.get(b.cardId)?.atk ?? 0) - (byId.get(a.cardId)?.atk ?? 0));

  for (const atk of attackers) {
    if (!defenders.length) {
      const plan = planAttack(state, byId, bot, atk, null);
      if (!plan || plan.damage <= 0) continue;
      out.push({
        type: "dispatch",
        action: plan,
        note: `${nameOf(atk, byId)} attacks directly (${plan.damage}).`,
        why: "No opponent monsters — direct attack is legal.",
      });
      continue;
    }
    const ordered = [...defenders].sort((a, b) => {
      const ad = byId.get(a.cardId);
      const bd = byId.get(b.cardId);
      const as = a.position === "def" && a.faceUp ? (ad?.def ?? 0) : a.faceUp ? (ad?.atk ?? 0) : 0;
      const bs = b.position === "def" && b.faceUp ? (bd?.def ?? 0) : b.faceUp ? (bd?.atk ?? 0) : 0;
      return as - bs;
    });
    for (const target of ordered) {
      const plan = planAttack(state, byId, bot, atk, target);
      if (!plan) continue;
      if (plan.destroyAttacker && !plan.destroyTarget) continue;
      if (plan.damagePlayer === bot && plan.damage > 0) continue;
      out.push({
        type: "dispatch",
        action: plan,
        note: `${nameOf(atk, byId)} attacks ${nameOf(target, byId)}.`,
        why: plan.destroyTarget ? "Can destroy in battle without dying." : "Safe attack (no LP loss / no suicide).",
      });
      break;
    }
  }
  return out;
}
