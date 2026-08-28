"use client";

import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDuelBot } from "@/components/play/useDuelBot";
import { useOnlineDuel } from "@/components/play/useOnlineDuel";
import { useCardViewer } from "@/components/cards/CardViewer";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { ActivationPrompt, type LegalResponse } from "@/components/play/ActivationPrompt";
import { SearchPicker } from "@/components/play/SearchPicker";
import { CostPicker } from "@/components/play/CostPicker";
import { CardActionMenu, type PlayAction } from "@/components/play/CardActionMenu";
import { ChainPanel } from "@/components/play/ChainPanel";
import { BoardCard, EmzRow, HandStrip, MonsterRow, SideColumn, SpellRow } from "@/components/play/DuelField";
import { PileModal } from "@/components/play/PileModal";
import { cardKind } from "@/lib/cards/kinds";
import type { CompactCard } from "@/lib/cards/types";
import { findCardRef, isFirstTurnStartingPlayer, parseZoneKey, peekCard, reduce } from "@/lib/game/engine";
import type { GameAction, GameState, PileZone, PlayerId, ZoneCard } from "@/lib/game/types";
import { activationOptions, type ActLoc, type ActivationOption } from "@/lib/rules/activationWindow";
import { collectLegalResponses } from "@/lib/rules/legalResponses";
import { cardActivationLabel, pickCardActivationClause } from "@/lib/rules/cardActivationClause";
import { cardMatchesSearch, findSearchCandidates, parseAllSearchSpecs, parseSearchSpec, type SearchSpec } from "@/lib/rules/searchEffect";
import {
  countDiffNamesOnFieldAndGy,
  fusionMentionsMaterial,
  isNormalMonsterCard,
  parseEffectOps,
  type EffectOp,
} from "@/lib/rules/effectOps";
import {
  bonusNormalSummonsFromText,
  canNormalSummonOrSet,
  fieldMonsterRefs,
  isExtraDeckMonster,
  remainingNormalSummons,
  tributesForNormalSummon,
} from "@/lib/rules/summonRules";
import { isFieldSpellCard, isOneShotSpellTrap, staysOnFieldAfterActivate } from "@/lib/rules/stLifecycle";
import {
  effectTargetCandidates,
  isLingeringMonsterNegate,
  monsterEffectsAreNegated,
  parseEffectTargets,
  pickPreferredMonsterTarget,
  type EffectTargetSpec,
} from "@/lib/rules/effectTarget";
import { handSSLegal, parseHandSpecialSummon } from "@/lib/rules/handSpecialSummon";
import { canDeclareAttack, parseEffectDamage, planAttack } from "@/lib/rules/battle";
import {
  canPayAllCosts,
  costCandidates,
  parseActivationCosts,
  type CostSpec,
} from "@/lib/rules/activationCost";
import { cardActivationSpeed, isMonster, isQuickPlaySpell, isSpell, isTrap, maxSpellSpeed, parseCard } from "@/lib/rules/psct";
import { scanActivations, dedupeActivationScan } from "@/lib/rules/scan";
import { explainActivationDenial, mergeTraces, recordTrace, subscribeTraces } from "@/lib/rules/activationDebug";
import { getBotThoughts, subscribeBotThoughts } from "@/lib/bot/thought";
import { buildEffectUse, isCardActivationTrigger, optNameKey } from "@/lib/rules/effectOpt";
import { profileCardActivation } from "@/lib/rules/effectProfile";
import { parseResponseGate } from "@/lib/rules/responseGate";
import { isLegalManualMove } from "@/lib/rules/moveLegality";
import {
  extraMaterialCandidates,
  parseAllExtraSummonSpecs,
  validateExtraMaterials,
  type ExtraSummonSpec,
} from "@/lib/rules/extraSummon";
import { findTriggerPrompts, type DuelEvent, type TriggerPrompt } from "@/lib/rules/triggers";
import { cn } from "@/lib/utils";
import { useCardStore } from "@/store/useCardStore";
import { useDuelUi } from "@/store/useDuelUi";
import { useGameStore } from "@/store/useGameStore";

function sinfulSpoilsSendCandidates(
  state: GameState,
  owner: PlayerId,
  archetypes: string[],
  byId: Map<number, CompactCard>,
): import("@/lib/game/types").ZoneRef[] {
  const p = state.players[owner];
  const out: import("@/lib/game/types").ZoneRef[] = [];
  const hit = (id: number) => {
    const d = byId.get(id);
    if (!d) return false;
    const n = d.name.toLowerCase();
    const a = (d.archetype ?? "").toLowerCase();
    return archetypes.some((arch) => {
      const q = arch.toLowerCase();
      return a === q || a.includes(q) || n.includes(q);
    });
  };
  p.hand.forEach((c, i) => {
    if (hit(c.cardId)) out.push({ owner, zone: "hand", index: i });
  });
  p.spells.forEach((c, i) => {
    if (c && hit(c.cardId)) out.push({ owner, zone: "st", index: i });
  });
  if (p.field && hit(p.field.cardId)) out.push({ owner, zone: "field" });
  return out;
}

type MenuState = {
  card: ZoneCard;
  where: "hand" | "field" | "st" | "pile" | "extra";
  loc: ActLoc;
  owner: PlayerId;
  x: number;
  y: number;
};

export function Playmat() {
  const localState = useGameStore((s) => s.current);
  const localDispatch = useGameStore((s) => s.dispatch);
  const undo = useGameStore((s) => s.undo);
  const persist = useGameStore((s) => s.persist);
  const byId = useCardStore((s) => s.byId);
  const { openCard } = useCardViewer();
  const autoPrompt = useDuelUi((s) => s.autoPrompt);
  const setAutoPrompt = useDuelUi((s) => s.setAutoPrompt);
  const rulesDebug = useDuelUi((s) => s.rulesDebug);
  const setRulesDebug = useDuelUi((s) => s.setRulesDebug);
  const botBrain = useDuelUi((s) => s.botBrain);
  const setBotBrain = useDuelUi((s) => s.setBotBrain);
  const online = useOnlineDuel();
  const state = online.active ? online.state : localState;
  const dispatch = online.active ? online.dispatch : localDispatch;

  const [selected, setSelected] = useState<ZoneCard | null>(null);
  const [activeCard, setActiveCard] = useState<ZoneCard | null>(null);
  const [lpDelta, setLpDelta] = useState(800);
  const [pile, setPile] = useState<{ owner: PlayerId; zone: PileZone } | null>(null);
  const [showChain, setShowChain] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [focus, setFocus] = useState<PlayerId>("p1");
  const [prompts, setPrompts] = useState<TriggerPrompt[]>([]);
  const [showMore, setShowMore] = useState(false);
  const [searchUi, setSearchUi] = useState<{
    owner: PlayerId;
    spec: SearchSpec;
    queue: SearchSpec[];
    title: string;
    instanceId?: string;
    data?: CompactCard;
    cardActivation?: boolean;
  } | null>(null);
  const [attackFrom, setAttackFrom] = useState<ZoneCard | null>(null);
  const [handSSUi, setHandSSUi] = useState<{
    owner: PlayerId;
    card: ZoneCard;
    data: CompactCard;
    spec: NonNullable<ReturnType<typeof parseHandSpecialSummon>>;
  } | null>(null);
  const [tributeUi, setTributeUi] = useState<{
    owner: PlayerId;
    card: ZoneCard;
    data: CompactCard;
    mode: "summon-atk" | "summon-def" | "set-monster";
    from: import("@/lib/game/types").ZoneRef;
    need: number;
    event?: DuelEvent;
  } | null>(null);
  const [extraUi, setExtraUi] = useState<{
    owner: PlayerId;
    card: ZoneCard;
    data: CompactCard;
    specs: ExtraSummonSpec[];
    specIndex: number;
    mode: "summon-atk" | "summon-def";
    from: import("@/lib/game/types").ZoneRef;
    event?: DuelEvent;
  } | null>(null);
  const [costUi, setCostUi] = useState<{
    owner: PlayerId;
    selfId?: string;
    spec: CostSpec;
    queue: CostSpec[];
    title: string;
    data: CompactCard;
    clauseIndex?: number;
    doChain: boolean;
    speed: 1 | 2 | 3;
    kind: string;
    label: string;
    search?: SearchSpec;
    searches?: SearchSpec[];
    cardActivation?: boolean;
    effectDamage?: ReturnType<typeof parseEffectDamage>;
    negatesPrevious?: boolean;
    targetInstanceIds?: string[];
    negateMonsterUntilEot?: boolean;
    targetSpec?: EffectTargetSpec | null;
    costRange?: { min: number; max: number };
  } | null>(null);
  const [targetUi, setTargetUi] = useState<{
    owner: PlayerId;
    selfId?: string;
    spec: EffectTargetSpec;
    title: string;
    data: CompactCard;
    clauseIndex?: number;
    doChain: boolean;
    speed: 1 | 2 | 3;
    kind: string;
    label: string;
    search?: SearchSpec;
    searches?: SearchSpec[];
    cardActivation?: boolean;
    effectDamage?: ReturnType<typeof parseEffectDamage>;
    negatesPrevious?: boolean;
    negateMonsterUntilEot?: boolean;
  } | null>(null);
  const [scaledSendUi, setScaledSendUi] = useState<{
    owner: PlayerId;
    need: number;
    archetypes: string[];
    label: string;
    summonFrom: { owner: PlayerId; zone: "extra" | "deck" | "gy" | "hand" | "banish"; index: number };
    rest: SearchSpec[];
    title: string;
    instanceId?: string;
    data?: CompactCard;
    cardActivation?: boolean;
    summonName: string;
  } | null>(null);
  const coarse = useCoarsePointer();
  const sentCountRef = useRef(0);
  const pendingOpsRef = useRef<EffectOp[]>([]);
  const [choiceUi, setChoiceUi] = useState<{
    owner: PlayerId;
    title: string;
    options: { label: string; ops: EffectOp[] }[];
    rest: EffectOp[];
    instanceId?: string;
    data?: CompactCard;
    cardActivation?: boolean;
  } | null>(null);
  const [excavateUi, setExcavateUi] = useState<{
    owner: PlayerId;
    cards: ZoneCard[];
    op: Extract<EffectOp, { kind: "excavate" }>;
    rest: EffectOp[];
    instanceId?: string;
    data?: CompactCard;
    cardActivation?: boolean;
  } | null>(null);
  const [declareUi, setDeclareUi] = useState<{
    owner: PlayerId;
    names: string[];
    op: Extract<EffectOp, { kind: "declare-name" }>;
    rest: EffectOp[];
    instanceId?: string;
    data?: CompactCard;
    cardActivation?: boolean;
  } | null>(null);
  const [fusionSpellUi, setFusionSpellUi] = useState<{
    owner: PlayerId;
    op: Extract<EffectOp, { kind: "fusion-spell" | "gaze-fusion" | "ritual-spell" }>;
    rest: EffectOp[];
    instanceId?: string;
    data?: CompactCard;
    cardActivation?: boolean;
    step: "pick-ed" | "pick-mats" | "pick-target";
    edPick?: ZoneCard;
    target?: ZoneCard;
  } | null>(null);
  const resolvedLenRef = useRef<number | null>(null);
  const resolvedGameId = useRef<string | null>(null);

  const act = useCallback((action: GameAction, event?: DuelEvent) => {
    const before = online.active ? state : useGameStore.getState().current;
    let ev = event;
    if (ev && action.type === "PLAY" && before && !ev.instanceId) {
      const piece = peekCard(before, action.from);
      if (piece) ev = { ...ev, cardId: piece.cardId, instanceId: piece.instanceId };
    }
    dispatch(action);
    if (!autoPrompt) return;
    const next = online.active && before ? reduce(before, action) : useGameStore.getState().current;
    if (!next) return;

    const events: DuelEvent[] = [];
    if (action.type === "NEXT_PHASE" || action.type === "PREV_PHASE") {
      events.push({ type: "phase", phase: next.phase, player: next.activePlayer, controller: next.activePlayer });
    } else if (action.type === "NEXT_TURN") {
      events.push({ type: "draw", player: next.activePlayer, controller: next.activePlayer });
      events.push({ type: "phase", phase: next.phase, player: next.activePlayer, controller: next.activePlayer });
    } else if (ev) {
      events.push(ev);
    }

    const found = events.flatMap((row) => findTriggerPrompts(next, byId, row));
    const unique: TriggerPrompt[] = [];
    const seen = new Set<string>();
    for (const p of found) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      unique.push(p);
    }
    if (unique.length) {
      const seat: PlayerId | null = online.active
        ? online.seat
        : next.pve
          ? next.pve.bot === "p1"
            ? "p2"
            : "p1"
          : null;
      const forHuman = seat ? unique.filter((p) => p.owner === seat) : unique.filter((p) => !next.pve || p.owner !== next.pve.bot);
      if (forHuman.length) setPrompts((cur) => {
        const ids = new Set(cur.map((p) => p.id));
        return [...cur, ...forHuman.filter((p) => !ids.has(p.id))];
      });
      if (!online.active) dispatch({ type: "FET", box: "yellow" });
      else if (next.fetBox !== "yellow") dispatch({ type: "FET", box: "yellow" });
    }
  }, [autoPrompt, byId, dispatch, online.active, online.seat, state]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  useEffect(() => {
    if (online.active) return;
    const t = setInterval(() => void persist(), 4000);
    return () => clearInterval(t);
  }, [persist, online.active]);

  useEffect(() => {
    if (!state?.pve || online.active) return;
    if (!prompts[0]) return;
    if (prompts[0].owner === state.pve.bot) return;
    const botTurn = state.activePlayer === state.pve.bot;
    const chainWaiting = state.chain.links.length > 0 && state.chain.pendingPlayer !== state.pve.bot;
    if (!botTurn && !chainWaiting) return;
    if (prompts[0].mandatory) return;
    const t = window.setTimeout(() => setPrompts((list) => list.slice(1)), 7000);
    return () => window.clearTimeout(t);
  }, [online.active, prompts, state?.activePlayer, state?.chain.links.length, state?.chain.pendingPlayer, state?.pve]);

  /* Master Duel / Nexus: auto-skip empty response windows only. */

  useEffect(() => {
    if (online.active) return;
    if (!state?.chain.complete || !state.chain.links.length) return;
    const topId = state.chain.links.at(-1)?.id;
    const t = window.setTimeout(() => {
      const now = useGameStore.getState().current;
      if (!now?.chain.complete || now.chain.links.at(-1)?.id !== topId) return;
      dispatch({ type: "CHAIN_RESOLVE_ONE" });
    }, 260);
    return () => window.clearTimeout(t);
  }, [dispatch, online.active, state, state?.chain.complete, state?.chain.links?.length, state?.chain.links?.at(-1)?.id]);

  useEffect(() => {
    if (!state) return;
    if (resolvedGameId.current !== state.id) {
      resolvedGameId.current = state.id;
      resolvedLenRef.current = state.chain.resolved.length;
      return;
    }
    if (resolvedLenRef.current == null) {
      resolvedLenRef.current = state.chain.resolved.length;
      return;
    }
    const prev = resolvedLenRef.current;
    if (state.chain.resolved.length <= prev) {
      resolvedLenRef.current = state.chain.resolved.length;
      return;
    }
    const added = state.chain.resolved.length - prev;
    const newly = state.chain.resolved.slice(0, added).reverse();
    resolvedLenRef.current = state.chain.resolved.length;
    for (const link of newly) {
      const pending = link.pendingResolve;
      if (!pending) continue;
      const data = byId.get(pending.cardId);
      if (link.negated) {
        setSearchUi((cur) => (cur?.instanceId && cur.instanceId === pending.instanceId ? null : cur));
        if (data) settleActivatedCard(pending.instanceId, data, pending.cardActivation);
        continue;
      }
      const live = online.active ? state : useGameStore.getState().current;
      if (live && pending.instanceId) {
        const mon =
          live.players.p1.monsters.find((c) => c?.instanceId === pending.instanceId) ??
          live.players.p2.monsters.find((c) => c?.instanceId === pending.instanceId) ??
          live.emz.find((c) => c?.instanceId === pending.instanceId) ??
          null;
        if (mon && monsterEffectsAreNegated(mon, live.turn)) {
          setSearchUi((cur) => (cur?.instanceId && cur.instanceId === pending.instanceId ? null : cur));
          if (data) settleActivatedCard(pending.instanceId, data, pending.cardActivation);
          continue;
        }
      }
      if (!data) continue;
      if (online.active && online.seat && pending.owner !== online.seat) continue;
      applyResolvedEffect({
        owner: pending.owner,
        data,
        instanceId: pending.instanceId,
        searches: pending.searches,
        cardActivation: pending.cardActivation,
        effectDamage: pending.damage ?? undefined,
        bonusNormalSummons: pending.bonusNormalSummons,
        ops: pending.ops,
        sentCount: pending.sentCount,
      });
    }
  }, [byId, online.active, online.seat, state]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!state) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") {
        if (prompts.length) {
          setPrompts((p) => p.slice(1));
          return;
        }
        setPile(null);
        setMenu(null);
        setSelected(null);
      }
      if (e.key === " ") {
        e.preventDefault();
        if (state.pve && state.activePlayer === state.pve.bot) return;
        act({ type: "NEXT_PHASE" });
      }
      if (e.key === "Enter") {
        if (state.pve && state.activePlayer === state.pve.bot) return;
        act({ type: "NEXT_TURN" });
      }
      if (e.key === "d") {
        const seat: PlayerId = state.pve ? (state.pve.bot === "p1" ? "p2" : "p1") : focus;
        act({ type: "DRAW", player: seat }, { type: "draw", player: seat, controller: seat });
      }
      if (e.key === "u") undo();
      if (e.key === "c") setShowChain((v) => !v);
      if (e.key === "a") setAutoPrompt(!autoPrompt);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act, autoPrompt, dispatch, focus, prompts.length, setAutoPrompt, state, undo]);

  const lockedSeat: PlayerId | null = online.active
    ? online.seat ?? state?.pvp?.seat ?? (state?.view === "p1" || state?.view === "p2" ? state.view : null)
    : state?.pve
      ? state.pve.bot === "p1"
        ? "p2"
        : "p1"
      : null;
  const self = lockedSeat ?? focus;
  const opp: PlayerId = self === "p1" ? "p2" : "p1";
  const fog = Boolean(online.active || state?.pvp || state?.pve);

  const onPromptNo = useCallback(() => setPrompts((list) => list.slice(1)), []);

  function liveState() {
    if (online.active) return state;
    return useGameStore.getState().current;
  }

  function applyCost(owner: PlayerId, spec: CostSpec, selfId: string | undefined, picks: import("@/lib/game/types").ZoneRef[]) {
    if (spec.kind === "pay-lp") {
      const live = liveState();
      if (!live) return;
      const amount = spec.halfLp ? Math.ceil(live.players[owner].lp / 2) : (spec.lp ?? 0);
      dispatch({ type: "SET_LP", player: owner, amount: -amount, mode: "delta" });
      return;
    }
    if (spec.kind === "detach") {
      const live = liveState();
      const ref = selfId && live ? findCardRef(live, selfId) : null;
      if (ref) for (let i = 0; i < spec.count; i += 1) dispatch({ type: "DETACH", ref });
      return;
    }
    if (spec.self && selfId) {
      const live = liveState();
      const ref = live ? findCardRef(live, selfId) : null;
      if (ref) {
        dispatch({
          type: "MOVE",
          from: ref,
          to: { owner, zone: spec.kind === "banish" ? "banish" : "gy" },
          faceUp: true,
        });
      }
      return;
    }
    for (const pick of picks) {
      if (pick.owner === "shared") continue;
      dispatch({
        type: "MOVE",
        from: pick,
        to: { owner, zone: spec.kind === "banish" ? "banish" : "gy" },
        faceUp: true,
      });
    }
    if (spec.kind === "send" || spec.kind === "discard" || spec.kind === "tribute") {
      sentCountRef.current += spec.self ? 1 : picks.length;
    }
  }

  function applyResolvedEffect(opts: {
    owner: PlayerId;
    data: CompactCard;
    instanceId?: string;
    searches?: SearchSpec[];
    search?: SearchSpec;
    cardActivation?: boolean;
    effectDamage?: ReturnType<typeof parseEffectDamage>;
    bonusNormalSummons?: number;
    ops?: EffectOp[];
    sentCount?: number;
  }) {
    const bonus = opts.bonusNormalSummons ?? bonusNormalSummonsFromText(`${opts.data.name} ${opts.data.desc}`);
    if (bonus) dispatch({ type: "GRANT_NORMAL_SUMMON", player: opts.owner, count: bonus });
    if (opts.effectDamage) {
      const foe: PlayerId = opts.owner === "p1" ? "p2" : "p1";
      const amt = opts.effectDamage.amount;
      if (opts.effectDamage.to === "both" || opts.effectDamage.to === "self") {
        dispatch({ type: "SET_LP", player: opts.owner, amount: -amt, mode: "delta" });
      }
      if (opts.effectDamage.to === "both" || opts.effectDamage.to === "opponent") {
        dispatch({ type: "SET_LP", player: foe, amount: -amt, mode: "delta" });
      }
    }
    const ops = opts.ops?.length ? opts.ops : [];
    const searchOps = ops.filter((o): o is Extract<EffectOp, { kind: "search" }> => o.kind === "search");
    const otherOps = ops.filter((o) => o.kind !== "search");
    const queue = opts.searches?.length
      ? opts.searches
      : opts.search
        ? [opts.search]
        : searchOps.map((o) => o.spec);
    if (otherOps.length) {
      const combined: EffectOp[] = [...otherOps, ...searchOps];
      runOpsQueue(opts.owner, combined, opts.instanceId, opts.data, opts.cardActivation, opts.sentCount ?? sentCountRef.current);
      return;
    }
    if (!queue.length) {
      settleActivatedCard(opts.instanceId, opts.data, opts.cardActivation);
      return;
    }
    openSearchQueue(opts.owner, queue, opts.data.name, opts.instanceId, opts.data, opts.cardActivation);
  }

  function runOpsQueue(
    owner: PlayerId,
    queue: EffectOp[],
    instanceId?: string,
    data?: CompactCard,
    cardActivation?: boolean,
    sentCount = sentCountRef.current,
  ) {
    const [head, ...rest] = queue;
    if (!head) {
      settleActivatedCard(instanceId, data, cardActivation);
      return;
    }
    const live = liveState();
    if (!live) return;
    const bot = live.pve?.bot === owner;

    if (head.kind === "search") {
      openSearchQueue(owner, [head.spec, ...rest.filter((o): o is Extract<EffectOp, { kind: "search" }> => o.kind === "search").map((o) => o.spec)], data?.name ?? "", instanceId, data, cardActivation);
      return;
    }
    if (head.kind === "choice") {
      if (bot) {
        runOpsQueue(owner, [...(head.options[0]?.ops ?? []), ...rest], instanceId, data, cardActivation, sentCount);
        return;
      }
      setChoiceUi({ owner, title: data?.name ?? "Choose effect", options: head.options, rest, instanceId, data, cardActivation });
      return;
    }
    if (head.kind === "draw") {
      let n = 0;
      if (head.amount === "sent-count") n = Math.max(0, sentCount);
      else if (head.amount === "board-diff-names") n = countDiffNamesOnFieldAndGy(live, byId, head.nameKeys ?? []);
      else n = head.amount;
      if (n > 0) dispatch({ type: "DRAW", player: owner, count: n });
      runOpsQueue(owner, rest, instanceId, data, cardActivation, sentCount);
      return;
    }
    if (head.kind === "excavate") {
      const top = live.players[owner].deck.slice(0, head.count);
      if (bot) {
        const pick = top.find((c) => {
          const d = byId.get(c.cardId);
          return d && head.addIf ? findSearchCandidates({ ...live, players: { ...live.players, [owner]: { ...live.players[owner], deck: top } } }, owner, { ...head.addIf, sources: ["deck"], source: "deck" }, byId).some((h) => h.card.instanceId === c.instanceId) : true;
        });
        if (pick) {
          const idx = live.players[owner].deck.findIndex((c) => c.instanceId === pick.instanceId);
          if (idx >= 0) dispatch({ type: "MOVE", from: { owner, zone: "deck", index: idx }, to: { owner, zone: "hand" }, faceUp: true });
        }
        runOpsQueue(owner, rest, instanceId, data, cardActivation, sentCount);
        return;
      }
      setExcavateUi({ owner, cards: top, op: head, rest, instanceId, data, cardActivation });
      return;
    }
    if (head.kind === "declare-name") {
      const names = new Set<string>();
      const p = live.players[owner];
      const consider = (id: number) => {
        const d = byId.get(id);
        if (!d) return;
        if (head.pool === "normal-monster" && !isNormalMonsterCard(d)) return;
        names.add(d.name);
      };
      if (head.pool === "main-deck") p.deck.forEach((c) => consider(c.cardId));
      else {
        [...p.hand, ...p.deck, ...p.gy].forEach((c) => consider(c.cardId));
        p.monsters.forEach((c) => c && consider(c.cardId));
      }
      const list = [...names].sort();
      if (bot && list[0]) {
        resolveDeclaredName(owner, list[0]!, head, rest, instanceId, data, cardActivation);
        return;
      }
      setDeclareUi({ owner, names: list, op: head, rest, instanceId, data, cardActivation });
      return;
    }
    if (head.kind === "negate-faceup") {
      const n = head.count === "sent-count" ? Math.max(1, sentCount) : head.count;
      const opp: PlayerId = owner === "p1" ? "p2" : "p1";
      const cands: ZoneCard[] = [];
      const addMon = (c: ZoneCard | null) => {
        if (c?.faceUp) cands.push(c);
      };
      if (head.oppOnly) live.players[opp].monsters.forEach(addMon);
      else {
        live.players.p1.monsters.forEach(addMon);
        live.players.p2.monsters.forEach(addMon);
        live.players.p1.spells.forEach((c) => c?.faceUp && cands.push(c));
        live.players.p2.spells.forEach((c) => c?.faceUp && cands.push(c));
        if (live.players.p1.field?.faceUp) cands.push(live.players.p1.field);
        if (live.players.p2.field?.faceUp) cands.push(live.players.p2.field);
      }
      const picks = cands.slice(0, n);
      if (picks.length) {
        dispatch({
          type: "NEGATE_CARDS",
          instanceIds: picks.map((c) => c.instanceId),
          untilTurn: live.turn,
          halfAtk: head.halfAtk,
          banish: head.banishAfter,
        });
      }
      runOpsQueue(owner, rest, instanceId, data, cardActivation, sentCount);
      return;
    }
    if (head.kind === "fusion-spell" || head.kind === "gaze-fusion" || head.kind === "ritual-spell") {
      if (bot) {
        runOpsQueue(owner, rest, instanceId, data, cardActivation, sentCount);
        return;
      }
      setFusionSpellUi({ owner, op: head, rest, instanceId, data, cardActivation, step: head.kind === "gaze-fusion" ? "pick-target" : "pick-ed" });
      return;
    }
    runOpsQueue(owner, rest, instanceId, data, cardActivation, sentCount);
  }

  function resolveDeclaredName(
    owner: PlayerId,
    name: string,
    op: Extract<EffectOp, { kind: "declare-name" }>,
    rest: EffectOp[],
    instanceId?: string,
    data?: CompactCard,
    cardActivation?: boolean,
  ) {
    const live = liveState();
    if (!live) return;
    if (op.then === "ss-declared-normal") {
      const spec: SearchSpec = {
        count: 1,
        source: "deck",
        sources: ["hand", "deck", "gy"],
        dest: "summon",
        quotedNames: [name],
        archetypes: [],
        exceptNames: [],
        typeHint: "monster",
        extraKinds: [],
        attributes: [],
        races: [],
        normalMonster: true,
        position: "def",
        label: `SS "${name}" in DEF`,
      };
      openSearchQueue(owner, [spec], data?.name ?? name, instanceId, data, cardActivation);
      return;
    }
    if (op.then === "banish-declared-from-deck") {
      const idx = live.players[owner].deck.findIndex((c) => (byId.get(c.cardId)?.name ?? "").toLowerCase() === name.toLowerCase());
      if (idx >= 0) {
        dispatch({ type: "MOVE", from: { owner, zone: "deck", index: idx }, to: { owner, zone: "banish" }, faceUp: true });
        dispatch({ type: "NEGATE_NAME", nameKey: name, untilTurn: live.turn });
        dispatch({ type: "SHUFFLE", player: owner, zone: "deck" });
      }
    }
    runOpsQueue(owner, rest, instanceId, data, cardActivation);
  }

  function finishEffectAfterCosts(opts: {
    owner: PlayerId;
    data: CompactCard;
    instanceId?: string;
    doChain: boolean;
    speed: 1 | 2 | 3;
    kind: string;
    label: string;
    search?: SearchSpec;
    searches?: SearchSpec[];
    clauseIndex?: number;
    cardActivation?: boolean;
    effectDamage?: ReturnType<typeof parseEffectDamage>;
    negatesPrevious?: boolean;
    clause?: ReturnType<typeof parseCard>[number] | null;
    targetInstanceIds?: string[];
    negateMonsterUntilEot?: boolean;
    ops?: EffectOp[];
    sentCount?: number;
  }) {
    const bonus = bonusNormalSummonsFromText(`${opts.data.name} ${opts.data.desc} ${opts.label}`);
    const oneShot = isOneShotSpellTrap(opts.data) && Boolean(opts.cardActivation);
    const queue = opts.searches?.length ? opts.searches : opts.search ? [opts.search] : [];
    const markIfAdded = () => {
      const marked = buildEffectUse(opts.owner, opts.data, opts.clauseIndex ?? -1, opts.instanceId, opts.clause ?? null);
      if (!marked) return;
      if (opts.doChain && !online.active) {
        const after = useGameStore.getState().current;
        const ok = Boolean(
          after?.chain.links.some(
            (l) =>
              (opts.instanceId && l.instanceId === opts.instanceId) ||
              (l.cardId === opts.data.id && l.player === opts.owner && l.label === opts.label),
          ),
        );
        if (!ok) {
          recordTrace({
            allowed: false,
            cardName: opts.data.name,
            player: opts.owner,
            kind: opts.kind,
            spellSpeed: opts.speed,
            clauseIndex: opts.clauseIndex,
            source: "ui",
            reason: "CHAIN_ADD rejected — once-per-turn not spent.",
          });
          return;
        }
      }
      dispatch({
        type: "MARK_EFFECT",
        player: marked.player,
        cardId: marked.cardId,
        cardName: opts.data.name,
        clauseIndex: marked.clauseIndex,
        instanceId: marked.instanceId,
        scope: marked.scope,
      });
    };
    if (opts.doChain) {
      dispatch({
        type: "CHAIN_ADD",
        player: opts.owner,
        cardId: opts.data.id,
        cardName: opts.data.name,
        instanceId: opts.instanceId,
        spellSpeed: opts.speed,
        kind: opts.kind,
        label: opts.label,
        clauseIndex: opts.clauseIndex,
        segoc: ((online.active ? state?.fetBox : useGameStore.getState().current?.fetBox) === "yellow" || state?.fetBox === "yellow") && opts.speed === 1,
        cardActivation: opts.cardActivation,
        leavesTo: oneShot ? "gy" : undefined,
        clauseText: profileCardActivation(opts.data, opts.clauseIndex).text,
        includes: profileCardActivation(opts.data, opts.clauseIndex).includes,
        negatesPrevious: opts.negatesPrevious,
        pendingResolve: {
          owner: opts.owner,
          instanceId: opts.instanceId,
          cardId: opts.data.id,
          cardActivation: opts.cardActivation,
          searches: queue.length ? queue : undefined,
          damage: opts.effectDamage
            ? { amount: opts.effectDamage.amount, to: opts.effectDamage.to }
            : undefined,
          bonusNormalSummons: bonus || undefined,
          targetInstanceIds: opts.targetInstanceIds,
          negateMonsterUntilEot: opts.negateMonsterUntilEot,
          ops: opts.ops ?? pendingOpsRef.current,
          sentCount: opts.sentCount ?? (sentCountRef.current || undefined),
        },
      });
      markIfAdded();
      return;
    }
    markIfAdded();
    applyResolvedEffect({
      owner: opts.owner,
      data: opts.data,
      instanceId: opts.instanceId,
      searches: queue,
      cardActivation: opts.cardActivation,
      effectDamage: opts.effectDamage,
      bonusNormalSummons: bonus || undefined,
      ops: opts.ops,
      sentCount: opts.sentCount ?? (sentCountRef.current || undefined),
    });
  }

  function settleActivatedCard(instanceId?: string, data?: CompactCard, cardActivation?: boolean) {
    if (!instanceId || !data || !cardActivation) return;
    if (staysOnFieldAfterActivate(data)) return;
    const live = liveState();
    if (!live) return;
    if (live.chain.links.some((l) => l.instanceId === instanceId)) return;
    dispatch({ type: "SETTLE_ACTIVATION", instanceId });
  }

  function openSearchQueue(
    owner: PlayerId,
    queue: SearchSpec[],
    title: string,
    instanceId?: string,
    data?: CompactCard,
    cardActivation?: boolean,
  ) {
    const [head, ...rest] = queue;
    if (!head) {
      settleActivatedCard(instanceId, data, cardActivation);
      return;
    }
    const live = liveState();
    if (live?.pve?.bot === owner) {
      const hits = findSearchCandidates(live, owner, head, byId);
      if (hits[0]) resolveSearchPick(owner, head, hits[0].index, rest, title, instanceId, data, cardActivation, hits[0].source);
      else if (rest.length) openSearchQueue(owner, rest, title, instanceId, data, cardActivation);
      else settleActivatedCard(instanceId, data, cardActivation);
      return;
    }
    setSearchUi({ owner, spec: head, queue: rest, title, instanceId, data, cardActivation });
  }

  function startEffectFlow(opts: {
    owner: PlayerId;
    data: CompactCard;
    instanceId?: string;
    clauseIndex?: number;
    doChain: boolean;
    speed?: 1 | 2 | 3;
    kind?: string;
    label?: string;
    search?: SearchSpec;
    cardActivation?: boolean;
  }) {
    const clauses = parseCard(opts.data);
    const activationIdx = clauses.findIndex((c) => isCardActivationTrigger(c));
    // Flipping/playing a Spell/Trap is NOT the same as its later ignition line
    // (Deception of the Sinful Spoils: activate card, THEN tribute to search).
    if (
      opts.cardActivation &&
      (opts.clauseIndex == null || opts.clauseIndex < 0) &&
      activationIdx < 0 &&
      staysOnFieldAfterActivate(opts.data)
    ) {
      const speed = (opts.speed ?? cardActivationSpeed(opts.data) ?? 1) as 1 | 2 | 3;
      finishEffectAfterCosts({
        owner: opts.owner,
        data: opts.data,
        instanceId: opts.instanceId,
        doChain: opts.doChain,
        speed: speed || 1,
        kind: opts.kind ?? (isTrap(opts.data) ? "trap" : "spell"),
        label: opts.label ?? cardActivationLabel(opts.data),
        searches: opts.search ? [opts.search] : [],
        clauseIndex: -1,
        cardActivation: true,
        clause: null,
        negatesPrevious: false,
      });
      return;
    }
    const pickedAct = opts.cardActivation ? pickCardActivationClause(opts.data) : null;
    const resolvedClauseIndex =
      opts.clauseIndex != null && opts.clauseIndex >= 0
        ? opts.clauseIndex
        : opts.cardActivation && activationIdx >= 0
          ? activationIdx
          : opts.cardActivation
            ? pickedAct?.index != null && pickedAct.index >= 0
              ? pickedAct.index
              : undefined
            : undefined;
    const clause =
      resolvedClauseIndex != null
        ? clauses[resolvedClauseIndex]
        : opts.cardActivation
          ? pickedAct?.clause ?? null
          : clauses.find((c) => !c.fromGY && !c.fromBanished && c.kind !== "continuous" && c.kind !== "summoning" && c.kind !== "trigger") ??
            clauses.find((c) => !c.fromGY && c.kind !== "trigger") ??
            clauses[0];
    const costSource =
      resolvedClauseIndex != null ? `${clause?.cost ?? ""} ${clause?.raw ?? ""}` : `${clause?.cost ?? ""} ${clause?.resolution ?? ""}`;
    const costs = parseActivationCosts(costSource);
    const parsedSearches = parseAllSearchSpecs(clause ? `${clause.resolution}` : "");
    const searches = opts.search
      ? [
          opts.search,
          ...parsedSearches.filter(
            (s) =>
              !(
                s.dest === opts.search!.dest &&
                s.source === opts.search!.source &&
                s.label === opts.search!.label
              ),
          ),
        ]
      : parsedSearches;
    const search = searches[0];
    const ops = parseEffectOps(clause ? `${clause.resolution} ${clause.raw}` : opts.data.desc);
    sentCountRef.current = 0;
    pendingOpsRef.current = ops;
    const live = liveState();
    if (!live) return;
    if (costs.length && !canPayAllCosts(live, opts.owner, costs, opts.instanceId, byId)) {
      recordTrace({
        allowed: false,
        cardName: opts.data.name,
        player: opts.owner,
        kind: opts.kind,
        clauseIndex: resolvedClauseIndex,
        source: live.pve?.bot === opts.owner ? "bot" : "ui",
        reason: `Cannot pay activation cost: ${costs.map((c) => c.label).join(", ")}.`,
      });
      if (!online.active) {
        dispatch({
          type: "DEBUG_NOTE",
          trace: {
            allowed: false,
            cardName: opts.data.name,
            player: opts.owner,
            kind: opts.kind,
            source: "ui",
            reason: `Cannot pay activation cost: ${costs.map((c) => c.label).join(", ")}.`,
          },
        });
      }
      return;
    }
    const targetText = `${clause?.cost ?? ""} ${clause?.resolution ?? ""} ${clause?.raw ?? ""} ${opts.cardActivation ? opts.data.desc : ""}`;
    const targetSpec = parseEffectTargets(targetText);
    const negateMonsterUntilEot = isLingeringMonsterNegate(targetText);
    const payload = {
      owner: opts.owner,
      data: opts.data,
      instanceId: opts.instanceId,
      doChain: opts.doChain,
      speed: (opts.speed ?? (clause?.spellSpeed === 2 || clause?.spellSpeed === 3 ? clause.spellSpeed : Math.max(maxSpellSpeed(opts.data), 1))) as 1 | 2 | 3,
      kind: opts.kind ?? clause?.kind ?? "activation",
      label: opts.label ?? clause?.condition ?? searches.map((s) => s.label).join(" → ") ?? opts.data.name,
      search,
      searches,
      clauseIndex: resolvedClauseIndex != null ? resolvedClauseIndex : clause ? clauses.indexOf(clause) : undefined,
      cardActivation: opts.cardActivation,
      effectDamage: parseEffectDamage(clause?.resolution ?? ""),
      clause,
      negatesPrevious: (() => {
        const gate = parseResponseGate(opts.data, clause);
        const chaining = Boolean(live.chain.links.length);
        if (gate?.negates && chaining) return true;
        if (!chaining) return false;
        const blob = `${clause?.resolution ?? ""} ${clause?.raw ?? ""}`;
        return /negate that (effect|activation)|negate the activation/.test(blob.toLowerCase());
      })(),
      negateMonsterUntilEot,
      targetInstanceIds: undefined as string[] | undefined,
      ops,
      sentCount: undefined as number | undefined,
    };

    const afterCosts = () => {
      if (!targetSpec) {
        finishEffectAfterCosts(payload);
        return;
      }
      const cur = liveState();
      if (!cur) return;
      const cands = effectTargetCandidates(cur, opts.owner, targetSpec, byId);
      if (!cands.length) {
        recordTrace({
          allowed: false,
          cardName: opts.data.name,
          player: opts.owner,
          kind: payload.kind,
          clauseIndex: payload.clauseIndex,
          source: cur.pve?.bot === opts.owner ? "bot" : "ui",
          reason: `No legal target: ${targetSpec.label}.`,
        });
        return;
      }
      const auto = Boolean(cur.pve?.bot === opts.owner) || cands.length === 1;
      if (auto) {
        const pick =
          cur.pve?.bot === opts.owner
            ? pickPreferredMonsterTarget(cur, opts.owner, targetSpec, byId)
            : cands[0]!.card;
        if (!pick) return;
        finishEffectAfterCosts({ ...payload, targetInstanceIds: [pick.instanceId] });
        return;
      }
      setTargetUi({
        owner: opts.owner,
        selfId: opts.instanceId,
        spec: targetSpec,
        title: opts.data.name,
        data: opts.data,
        clauseIndex: payload.clauseIndex,
        doChain: opts.doChain,
        speed: payload.speed,
        kind: payload.kind,
        label: payload.label,
        search,
        searches: payload.searches,
        cardActivation: payload.cardActivation,
        effectDamage: payload.effectDamage,
        negatesPrevious: payload.negatesPrevious,
        negateMonsterUntilEot,
      });
    };

    const runQueue = (queue: CostSpec[]) => {
      const [head, ...rest] = queue;
      if (!head) {
        afterCosts();
        return;
      }
      const cur = liveState();
      const autoPay = Boolean(cur?.pve?.bot === opts.owner || head.self);
      if (autoPay) {
        if (!cur) return;
        if (head.self && !canPayAllCosts(cur, opts.owner, [head], opts.instanceId, byId)) {
          recordTrace({
            allowed: false,
            cardName: opts.data.name,
            player: opts.owner,
            kind: payload.kind,
            clauseIndex: payload.clauseIndex,
            source: "ui",
            reason: `Cannot pay ${head.label}.`,
          });
          return;
        }
        const cands = costCandidates(cur, opts.owner, head, opts.instanceId, byId);
        applyCost(opts.owner, head, opts.instanceId, cands.slice(0, Math.max(1, head.count)).map((c) => c.ref));
        runQueue(rest);
        return;
      }
      setCostUi({
        owner: opts.owner,
        selfId: opts.instanceId,
        spec: head,
        queue: rest,
        title: opts.data.name,
        data: opts.data,
        costRange:
          head.minCount != null || head.maxCount != null
            ? { min: head.minCount ?? 1, max: head.maxCount ?? head.count }
            : undefined,
        clauseIndex: payload.clauseIndex,
        doChain: opts.doChain,
        speed: payload.speed,
        kind: payload.kind,
        label: payload.label,
        search,
        searches: payload.searches,
        cardActivation: payload.cardActivation,
        effectDamage: payload.effectDamage,
        negatesPrevious: payload.negatesPrevious,
        negateMonsterUntilEot: payload.negateMonsterUntilEot,
        targetSpec,
      });
    };
    runQueue(costs);
  }

  const onPromptYes = useCallback(() => {
    setPrompts((list) => {
      const p = list[0];
      if (!p) return list;
      const data = byId.get(p.cardId);
      if (data) {
        window.setTimeout(() => {
          startEffectFlow({
            owner: p.owner,
            data,
            instanceId: p.instanceId,
            clauseIndex: p.clauseIndex,
            doChain: true,
            speed: p.spellSpeed === 2 ? 2 : 1,
            kind: p.kind,
            label: p.summary,
            search:
              p.search ??
              (p.setFromDeck ? parseSearchSpec(`Set 1 "${p.setFromDeck}" from your Deck`) ?? undefined : undefined),
          });
        }, 0);
      }
      return list.slice(1);
    });
  }, [byId]);

  function resolveSearchPick(
    owner: PlayerId,
    spec: SearchSpec,
    index: number,
    rest: SearchSpec[] = [],
    title = "",
    instanceId?: string,
    data?: CompactCard,
    cardActivation?: boolean,
    source = spec.source,
  ) {
    const from =
      source === "extra" || source === "gy" || source === "hand" || source === "banish" || source === "deck"
        ? ({ owner, zone: source, index } as const)
        : ({ owner, zone: "deck" as const, index } as const);
    if (spec.dest === "hand") {
      dispatch({ type: "MOVE", from, to: { owner, zone: "hand" }, faceUp: true });
      const live = liveState();
      if (live && autoPrompt && (source === "deck" || spec.source === "deck")) {
        const piece = live.players[owner].hand[0];
        const ev = {
          type: "add-to-hand" as const,
          player: owner,
          toPlayer: owner,
          controller: owner,
          cardId: piece?.cardId,
          instanceId: piece?.instanceId,
          fromZone: "deck" as const,
          phase: live.phase,
        };
        const found = findTriggerPrompts(live, byId, ev);
        const botId = live.pve?.bot;
        const forHuman = found.filter((p) => (online.active ? p.owner === self : !botId || p.owner !== botId));
        if (forHuman.length) {
          setPrompts((cur) => {
            const ids = new Set(cur.map((x) => x.id));
            return [...cur, ...forHuman.filter((p) => !ids.has(p.id))];
          });
        }
        if (botId) {
          for (const [i, p] of found.filter((x) => x.owner === botId).entries()) {
            const pdata = byId.get(p.cardId);
            if (!pdata) continue;
            window.setTimeout(() => {
              startEffectFlow({
                owner: botId,
                data: pdata,
                instanceId: p.instanceId,
                clauseIndex: p.clauseIndex,
                doChain: true,
                speed: p.spellSpeed === 2 ? 2 : 1,
                kind: p.kind,
                label: p.summary,
              });
            }, 40 + i * 40);
          }
        }
      }
    }
    else if (spec.dest === "set-st") dispatch({ type: "PLAY", from, player: owner, mode: "set-st" });
    else if (spec.dest === "gy") dispatch({ type: "MOVE", from, to: { owner, zone: "gy" }, faceUp: true });
    else if (spec.dest === "banish") dispatch({ type: "MOVE", from, to: { owner, zone: "banish" }, faceUp: true });
    else if (spec.dest === "top-deck") {
      dispatch({
        type: "MOVE",
        from,
        to: { owner, zone: "deck", index: 0 },
        faceUp: false,
      });
    }
    else if (spec.dest === "summon") {
      const cur = liveState() ?? state;
      const pile = cur
        ? source === "extra"
          ? cur.players[owner].extra
          : source === "gy"
            ? cur.players[owner].gy
            : source === "hand"
              ? cur.players[owner].hand
              : source === "banish"
                ? cur.players[owner].banish
                : cur.players[owner].deck
        : [];
      const liveCard = pile[index];
      const picked = liveCard ? byId.get(liveCard.cardId) : undefined;
      if (spec.sendPerLevels && picked && source === "extra") {
        const need = Math.max(0, Math.floor((picked.level ?? 0) / spec.sendPerLevels.divisor));
        if (need > 0) {
          const finishSummon = () => {
            const now = liveState() ?? state;
            const ed = now?.players[owner].extra ?? [];
            const still = ed.findIndex((c) => c.instanceId === liveCard?.instanceId);
            const useIndex = still >= 0 ? still : index;
            act(
              {
                type: "PLAY",
                from: { owner, zone: "extra", index: useIndex },
                player: owner,
                mode: spec.position === "def" ? "summon-def" : "summon-atk",
                special: true,
                effectSummon: true,
              },
              {
                type: "summon",
                player: owner,
                controller: owner,
                cardId: picked.id,
                instanceId: liveCard?.instanceId,
                summonKind: "special",
              },
            );
            if (rest.length) openSearchQueue(owner, rest, title, instanceId, data, cardActivation);
            else settleActivatedCard(instanceId, data, cardActivation);
          };
          if (cur?.pve?.bot === owner) {
            const pays = sinfulSpoilsSendCandidates(cur, owner, spec.sendPerLevels.archetypes, byId).slice(0, need);
            if (pays.length >= need) {
              for (const ref of pays) {
                dispatch({ type: "MOVE", from: ref, to: { owner, zone: "gy" }, faceUp: true });
              }
              finishSummon();
              return;
            }
            settleActivatedCard(instanceId, data, cardActivation);
            return;
          }
          setScaledSendUi({
            owner,
            need,
            archetypes: spec.sendPerLevels.archetypes,
            label: spec.sendPerLevels.label,
            summonFrom: { owner, zone: "extra", index },
            rest,
            title,
            instanceId,
            data,
            cardActivation,
            summonName: picked.name,
          });
          return;
        }
      }
      act(
        {
          type: "PLAY",
          from,
          player: owner,
          mode: spec.position === "def" ? "summon-def" : "summon-atk",
          special: true,
          effectSummon: source === "extra",
        },
        {
          type: "summon",
          player: owner,
          controller: owner,
          cardId: picked?.id ?? liveCard?.cardId,
          instanceId: liveCard?.instanceId,
          summonKind: "special",
        },
      );
    }
    if (source === "deck" && spec.dest !== "top-deck") dispatch({ type: "SHUFFLE", player: owner, zone: "deck" });
    if (rest.length) {
      window.setTimeout(() => openSearchQueue(owner, rest, title, instanceId, data, cardActivation), 40);
    } else {
      settleActivatedCard(instanceId, data, cardActivation);
    }
  }

  function onBotAct(action: GameAction, event?: DuelEvent) {
    if (action.type === "CHAIN_ADD" && action.instanceId) {
      const data = byId.get(action.cardId);
      if (data) {
        startEffectFlow({
          owner: action.player,
          data,
          instanceId: action.instanceId,
          clauseIndex: action.clauseIndex,
          doChain: true,
          speed: action.spellSpeed,
          kind: action.kind,
          label: action.label,
        });
        return;
      }
    }

    act(action, event);

    const live = useGameStore.getState().current;
    const botId = live?.pve?.bot;
    if (!live || !botId) return;

    if (event && (event.type === "summon" || event.type === "activation" || event.type === "sent-gy")) {
      const found = findTriggerPrompts(live, byId, event).filter((p) => p.owner === botId);
      for (const [i, p] of found.entries()) {
        const data = byId.get(p.cardId);
        if (!data) continue;
        window.setTimeout(() => {
          startEffectFlow({
            owner: botId,
            data,
            instanceId: p.instanceId,
            clauseIndex: p.clauseIndex,
            doChain: true,
            speed: p.spellSpeed === 2 ? 2 : 1,
            kind: p.kind,
            label: p.summary,
            search: p.search ?? (p.setFromDeck ? parseSearchSpec(`Set 1 "${p.setFromDeck}" from your Deck`) ?? undefined : undefined),
          });
        }, i * 20);
      }
    }

    if (action.type !== "PLAY") return;
    if (action.mode !== "activate-st" && action.mode !== "to-field") return;
    const p = live.players[botId];
    const zc =
      action.mode === "to-field"
        ? p.field
        : p.spells.find((c) => c?.faceUp && c.leaveOnResolve === "gy") ?? p.spells.find((c) => c?.faceUp) ?? null;
    if (!zc) return;
    const data = byId.get(zc.cardId);
    if (!data) return;
    if (isSpell(data)) dispatch({ type: "FLAG_SPELL_ACTIVATED" });
    startEffectFlow({
      owner: botId,
      data,
      instanceId: zc.instanceId,
      doChain: true,
      cardActivation: true,
    });
  }

  const bot = useDuelBot({
    state: online.active ? null : state,
    byId,
    prompt: prompts[0] ?? null,
    onAct: onBotAct,
    onPromptYes,
    onPromptNo,
  });

  const menuFx = useMemo(() => {
    if (!menu || !state) return [];
    const data = byId.get(menu.card.cardId);
    if (!data) return [];
    return activationOptions(state, data, menu.card, menu.loc, menu.owner, byId);
  }, [menu, state, byId]);

  const legalResponses = useMemo((): LegalResponse[] => {
    if (!state) return [];
    return collectLegalResponses(state, self, byId).map(({ card, data, opt, where }) => ({ card, data, opt, where }));
  }, [state, byId, self]);

  useEffect(() => {
    if (!state) return;
    if (!state.chain.links.length || state.chain.complete) return;
    if (state.chain.pendingPlayer !== self) return;
    if (prompts[0]) return;
    if (searchUi || costUi) return;
    if (legalResponses.length > 0) return;
    const linkId = state.chain.links.at(-1)?.id;
    const t = window.setTimeout(() => {
      const now = online.active ? state : useGameStore.getState().current;
      if (!now?.chain.links.length || now.chain.complete) return;
      if (now.chain.pendingPlayer !== self) return;
      if (now.chain.links.at(-1)?.id !== linkId) return;
      if (byId.size < 1) return;
      dispatch({ type: "CHAIN_PASS", player: self });
    }, online.active ? 1200 : 280);
    return () => window.clearTimeout(t);
  }, [
    costUi,
    dispatch,
    legalResponses.length,
    online.active,
    prompts,
    searchUi,
    self,
    state,
    state?.chain.complete,
    state?.chain.links,
    state?.chain.pendingPlayer,
  ]);

  const debugScan = useMemo(() => {
    if (!state || !rulesDebug) return [];
    return dedupeActivationScan(scanActivations(state, byId)).slice(0, 24);
  }, [state, byId, rulesDebug]);

  const [traceTick, setTraceTick] = useState(0);
  useEffect(() => subscribeTraces(() => setTraceTick((n) => n + 1)), []);
  const [brainTick, setBrainTick] = useState(0);
  useEffect(() => subscribeBotThoughts(() => setBrainTick((n) => n + 1)), []);
  const botThoughts = useMemo(() => (botBrain ? getBotThoughts() : []), [botBrain, brainTick]);
  const debugTraces = useMemo(
    () => mergeTraces(state?.debugTrace).slice(0, 28),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state?.debugTrace, traceTick, rulesDebug],
  );
  const menuDenial = useMemo(() => {
    if (!rulesDebug || !menu || !state) return [] as string[];
    const data = byId.get(menu.card.cardId);
    if (!data) return ["Card data not loaded."];
    return explainActivationDenial(state, data, menu.card, menu.loc, menu.owner, byId);
  }, [rulesDebug, menu, state, byId]);

  const prevOnlineRef = useRef<GameState | null>(null);
  useEffect(() => {
    if (!online.active || !state || !autoPrompt) {
      prevOnlineRef.current = state ?? null;
      return;
    }
    const prev = prevOnlineRef.current;
    prevOnlineRef.current = state;
    if (!prev || prev.id !== state.id) return;
    const events: DuelEvent[] = [];
    for (const pid of ["p1", "p2"] as PlayerId[]) {
      state.players[pid].monsters.forEach((c, i) => {
        const was = prev.players[pid].monsters[i];
        if (c?.faceUp && (!was || was.instanceId !== c.instanceId)) {
          events.push({
            type: "summon",
            player: pid,
            controller: pid,
            cardId: c.cardId,
            instanceId: c.instanceId,
            summonKind: "special",
          });
        }
      });
      const gyHead = state.players[pid].gy[0];
      const prevGy = prev.players[pid].gy[0];
      if (gyHead && gyHead.instanceId !== prevGy?.instanceId) {
        events.push({ type: "sent-gy", player: pid, controller: pid, cardId: gyHead.cardId, instanceId: gyHead.instanceId });
      }
    }
    const top = state.chain.links.at(-1);
    const prevTop = prev.chain.links.at(-1);
    if (top && top.id !== prevTop?.id && top.cardActivation) {
      events.push({
        type: "activation",
        player: top.player,
        controller: top.player,
        cardId: top.cardId,
        instanceId: top.instanceId,
      });
    }
    if (!events.length) return;
    const found = events.flatMap((ev) => findTriggerPrompts(state, byId, ev)).filter((p) => p.owner === self);
    if (!found.length) return;
    setPrompts((cur) => {
      const ids = new Set(cur.map((p) => p.id));
      return [...cur, ...found.filter((p) => !ids.has(p.id))];
    });
  }, [autoPrompt, byId, online.active, self, state]);

  if (!state) {
    return (
      <div className="p-8 text-sm text-white/70">
        {online.active ? (
          <>
            <p>Connecting to room {online.code}…</p>
            <p className="mt-2 text-white/40">If this hangs, the test server may have slept. Refresh in a few seconds.</p>
          </>
        ) : (
          <>
            <p>No active duel.</p>
            <Link href="/play" className="text-accent">
              Start one
            </Link>
          </>
        )}
      </div>
    );
  }

  const selfState = state.players[self];
  const oppState = state.players[opp];
  const revealSelf = fog ? true : state.view === "god" || state.view === self;
  const revealOpp = fog ? false : state.view === "god" || state.view === opp;

  function locOf(card: ZoneCard): ActLoc {
    const ref = state ? findCardRef(state, card.instanceId) : null;
    if (!ref) return "gy";
    if (ref.zone === "hand") return "hand";
    if (ref.zone === "monster" || ref.zone === "emz") return "field";
    if (ref.zone === "st" || ref.zone === "field") return "st";
    if (ref.zone === "gy") return "gy";
    if (ref.zone === "banish") return "banish";
    if (ref.zone === "extra") return "extra";
    return "deck";
  }

  function openMenu(card: ZoneCard, where: MenuState["where"], owner: PlayerId, point?: { x: number; y: number }) {
    setSelected(card);
    setMenu({
      card,
      where,
      loc: locOf(card),
      owner,
      x: point?.x ?? (typeof window !== "undefined" ? window.innerWidth / 2 : 0),
      y: point?.y ?? (typeof window !== "undefined" ? window.innerHeight / 2 : 0),
    });
  }

  function executeAttack(attacker: ZoneCard, target?: ZoneCard | null) {
    if (!state) return;
    const owner = ownerOf(attacker);
    const plan = planAttack(state, byId, owner, attacker, target);
    if (!plan) return;
    act(plan);
    setAttackFrom(null);
  }

  function onCardTap(card: ZoneCard, where: MenuState["where"], owner: PlayerId) {
    if (attackFrom && where === "field" && owner !== ownerOf(attackFrom)) {
      executeAttack(attackFrom, card);
      return;
    }
    setSelected(card);
    // Face-down own backrow: tap must offer Activate (Set Continuous/Normal Spells are live this turn).
    const ownSetBackrow = owner === self && !card.faceUp && (where === "st" || where === "field");
    const ownHand = owner === self && where === "hand";
    const ownField = owner === self && (where === "field" || where === "st");
    if (coarse || where === "extra" || ownSetBackrow || ownHand || ownField) openMenu(card, where, owner);
    else viewCard(card);
  }

  function viewCard(card: ZoneCard) {
    if (fog && state) {
      const ref = findCardRef(state, card.instanceId);
      if (ref && ref.owner !== "shared" && ref.owner !== self) {
        if (!card.faceUp) return;
        if (ref.zone === "hand" || ref.zone === "deck" || ref.zone === "extra" || ref.zone === "side") return;
      }
    }
    setSelected(card);
    const data = byId.get(card.cardId);
    if (data) openCard(data);
  }

  function ownerOf(card: ZoneCard): PlayerId {
    const ref = state ? findCardRef(state, card.instanceId) : null;
    if (!ref || ref.owner === "shared") return self;
    return ref.owner;
  }

  function whereOf(card: ZoneCard): MenuState["where"] {
    const ref = state ? findCardRef(state, card.instanceId) : null;
    if (!ref) return "pile";
    if (ref.zone === "hand") return "hand";
    if (ref.zone === "monster" || ref.zone === "emz" || ref.zone === "field") return "field";
    if (ref.zone === "st") return "st";
    if (ref.zone === "extra") return "extra";
    return "pile";
  }

  function runAction(
    action: PlayAction,
    card: ZoneCard,
    owner: PlayerId,
    where: MenuState["where"] | "gy",
    option?: ActivationOption,
  ) {
    if (!state) return;
    const ref = findCardRef(state, card.instanceId);
    if (!ref) return;
    const data = byId.get(card.cardId);

    if (action === "view") {
      viewCard(card);
      return;
    }
    if (action === "ss-hand" && data) {
      const spec = parseHandSpecialSummon(data);
      if (!spec) return;
      const mine = state.players[owner].monsters.filter(Boolean).length;
      const theirs = state.players[owner === "p1" ? "p2" : "p1"].monsters.filter(Boolean).length;
      const payOk = !spec.cost || canPayAllCosts(state, owner, [spec.cost], card.instanceId, byId);
      if (!handSSLegal(spec, mine, theirs, payOk)) return;
      if (!spec.cost) {
        act(
          { type: "PLAY", from: ref, player: owner, mode: "summon-atk", special: true },
          { type: "summon", player: owner, controller: owner, cardId: card.cardId, instanceId: card.instanceId, summonKind: "special" },
        );
        return;
      }
      setHandSSUi({ owner, card, data, spec });
      return;
    }
    if (action === "attack-direct") {
      executeAttack(card, null);
      return;
    }
    if (action === "attack") {
      const foes = state.players[owner === "p1" ? "p2" : "p1"].monsters.filter(Boolean) as ZoneCard[];
      if (!foes.length) executeAttack(card, null);
      else if (foes.length === 1) executeAttack(card, foes[0]!);
      else setAttackFrom(card);
      return;
    }
    if (
      action === "summon-atk" ||
      action === "summon-def" ||
      action === "ss-atk" ||
      action === "ss-def" ||
      action === "set-monster" ||
      action === "set-st" ||
      action === "activate-st" ||
      action === "to-field"
    ) {
      const special =
        action === "ss-atk" ||
        action === "ss-def" ||
        where === "extra" ||
        ref.zone === "extra" ||
        ref.zone === "gy" ||
        ref.zone === "banish" ||
        ref.zone === "deck";
      const mode: "summon-atk" | "summon-def" | "set-monster" | "set-st" | "activate-st" | "to-field" =
        action === "ss-atk" || action === "summon-atk"
          ? "summon-atk"
          : action === "ss-def" || action === "summon-def"
            ? "summon-def"
            : action === "activate-st" && data && isFieldSpellCard(data)
              ? "to-field"
              : action === "to-field"
                ? "to-field"
                : action;
      const event: DuelEvent | undefined =
        action === "summon-atk" || action === "summon-def" || action === "ss-atk" || action === "ss-def"
          ? {
              type: "summon",
              player: owner,
              controller: owner,
              cardId: card.cardId,
              instanceId: card.instanceId,
              summonKind: special ? "special" : "normal",
            }
          : action === "activate-st" || action === "to-field"
            ? { type: "activation", player: owner, controller: owner, cardId: card.cardId, instanceId: card.instanceId }
            : undefined;

      if ((action === "summon-atk" || action === "summon-def" || action === "set-monster") && !special && data) {
        if (isExtraDeckMonster(data)) return;
        if (!canNormalSummonOrSet(state, owner)) return;
        const need = tributesForNormalSummon(data);
        if (need < 0) return;
        if (need > 0) {
          const mats = fieldMonsterRefs(state, owner);
          if (mats.length < need) return;
          setTributeUi({ owner, card, data, mode: action, from: ref, need, event });
          return;
        }
      }

      if ((action === "summon-atk" || action === "summon-def") && (where === "extra" || ref.zone === "extra") && data) {
        const specs = parseAllExtraSummonSpecs(data).filter((spec) => {
          if (spec.requiresSpellActivatedThisTurn && !state.activatedSpellThisTurn) return false;
          if (spec.needsFusionSpell && !extraMaterialCandidates(state, owner, spec, byId).length && spec.minCount > 0) {
            /* still show fusion if spell exists; candidate check below */
          }
          return extraMaterialCandidates(state, owner, spec, byId).length >= spec.minCount;
        });
        if (!specs.length) return;
        setExtraUi({
          owner,
          card,
          data,
          specs,
          specIndex: 0,
          mode: action === "summon-def" ? "summon-def" : "summon-atk",
          from: ref,
          event,
        });
        setPile(null);
        return;
      }

      if ((action === "ss-atk" || action === "ss-def") && data && isExtraDeckMonster(data)) return;

      act(
        {
          type: "PLAY",
          from: ref,
          player: owner,
          mode,
          special,
          leaveOnResolve: action === "activate-st" && data && isOneShotSpellTrap(data) ? "gy" : undefined,
        },
        event,
      );
      if ((action === "activate-st" || action === "to-field") && data && isSpell(data)) {
        dispatch({ type: "FLAG_SPELL_ACTIVATED" });
      }
      if (where === "extra" || ref.zone === "extra") setPile(null);
      if ((action === "activate-st" || action === "to-field") && data) {
        startEffectFlow({
          owner,
          data,
          instanceId: card.instanceId,
          doChain: true,
          clauseIndex: option?.clauseIndex != null && option.clauseIndex >= 0 ? option.clauseIndex : undefined,
          cardActivation: true,
        });
      }
      return;
    }
    if (action === "flip" && ref) act({ type: "FLIP", ref }, { type: "flip", player: owner, cardId: card.cardId });
    if (action === "rotate" && ref) dispatch({ type: "ROTATE", ref });
    if (action === "to-gy") {
      act(
        { type: "MOVE", from: ref, to: { owner, zone: "gy" }, faceUp: true },
        { type: "sent-gy", player: owner, controller: owner, cardId: card.cardId, instanceId: card.instanceId },
      );
    }
    if (action === "to-banish") {
      act(
        { type: "MOVE", from: ref, to: { owner, zone: "banish" }, faceUp: true },
        { type: "banish", player: owner, controller: owner, cardId: card.cardId, instanceId: card.instanceId },
      );
    }
    if (action === "to-hand") {
      dispatch({
        type: "MOVE",
        from: ref,
        to: { owner, zone: "hand" },
        faceUp: true,
        manual: true,
        player: self,
      });
      return;
    }
    if (action === "chain" && data && ref) {
      startEffectFlow({
        owner,
        data,
        instanceId: card.instanceId,
        clauseIndex: option?.clauseIndex,
        doChain: true,
        speed: option?.spellSpeed,
        kind: option?.kind,
        label: option?.summary,
      });
    }
    void where;
  }

  function onDragStart(e: DragStartEvent) {
    if (!state) return;
    const all = collectCards(state);
    setActiveCard(all.find((c) => c.instanceId === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    const dragged = activeCard;
    setActiveCard(null);
    if (!e.over || !state || !dragged) return;
    const from = findCardRef(state, String(e.active.id));
    const to = parseZoneKey(String(e.over.id));
    if (!from || !to) return;

    const data = byId.get(dragged.cardId);
    const kind = data ? cardKind(data) : "monster";
    const fromHand = from.zone === "hand";

    if (from.owner !== "shared" && from.owner !== self) return;

    if (from.zone === "monster" && to.zone === "monster" && from.owner !== to.owner && state.phase === "BP") {
      const target = state.players[to.owner].monsters[to.index ?? -1];
      executeAttack(dragged, target ?? null);
      return;
    }
    if (
      from.zone === "monster" &&
      to.zone === "monster" &&
      from.owner === to.owner &&
      from.owner !== "shared" &&
      to.owner !== "shared" &&
      from.index !== to.index
    ) {
      const sitting = state.players[to.owner].monsters[to.index ?? -1];
      if (sitting) {
        act({ type: "OVERLAY", from, onto: to });
        return;
      }
    }
    if (fromHand && to.zone === "monster") {
      if (to.owner !== self) return;
      const special = from.zone !== "hand" || (data ? isExtraDeckMonster(data) : false);
      if (!special && data) {
        if (!canNormalSummonOrSet(state, to.owner)) return;
        if (isExtraDeckMonster(data)) return;
        const need = tributesForNormalSummon(data);
        if (need < 0) return;
        if (need > 0) {
          const mats = fieldMonsterRefs(state, to.owner);
          if (mats.length < need) return;
          setTributeUi({
            owner: to.owner,
            card: dragged,
            data,
            mode: "summon-atk",
            from,
            need,
            event: {
              type: "summon",
              player: to.owner,
              controller: to.owner,
              cardId: dragged.cardId,
              instanceId: dragged.instanceId,
              summonKind: "normal",
            },
          });
          return;
        }
      }
      act(
        {
          type: "PLAY",
          from,
          player: to.owner,
          mode: "summon-atk",
          slot: to.index,
          special,
        },
        {
          type: "summon",
          player: to.owner,
          controller: to.owner,
          cardId: dragged.cardId,
          instanceId: dragged.instanceId,
          summonKind: special ? "special" : "normal",
        },
      );
      return;
    }
    if (fromHand && to.zone === "emz") {
      if (data && !isExtraDeckMonster(data)) return;
      act(
        {
          type: "MOVE",
          from,
          to,
          faceUp: true,
          position: "atk",
        },
        {
          type: "summon",
          player: self,
          controller: self,
          cardId: dragged.cardId,
          instanceId: dragged.instanceId,
          summonKind: "special",
        },
      );
      return;
    }
    if (fromHand && to.zone === "field") {
      if (to.owner !== self) return;
      act(
        { type: "PLAY", from, player: to.owner, mode: "to-field" },
        {
          type: "activation",
          player: to.owner,
          controller: to.owner,
          cardId: dragged.cardId,
          instanceId: dragged.instanceId,
        },
      );
      if (data) {
        startEffectFlow({
          owner: to.owner,
          data,
          instanceId: dragged.instanceId,
          doChain: true,
          cardActivation: true,
        });
      }
      return;
    }
    if (fromHand && to.zone === "st") {
      if (to.owner !== self) return;
      const fromHandOpts = data ? activationOptions(state, data, dragged, "hand", self, byId) : [];
      const activate =
        kind === "spell" &&
        data?.race?.toLowerCase() !== "field" &&
        fromHandOpts.some((o) => o.mode === "card");
      act(
        {
          type: "PLAY",
          from,
          player: to.owner,
          mode: activate ? "activate-st" : "set-st",
          slot: to.index,
          leaveOnResolve: activate && data && isOneShotSpellTrap(data) ? "gy" : undefined,
        },
        activate
          ? {
              type: "activation",
              player: to.owner,
              controller: to.owner,
              cardId: dragged.cardId,
              instanceId: dragged.instanceId,
            }
          : undefined,
      );
      if (activate && data) {
        startEffectFlow({
          owner: to.owner,
          data,
          instanceId: dragged.instanceId,
          doChain: true,
          cardActivation: true,
        });
      }
      return;
    }
    if ((to.zone === "gy" || to.zone === "banish") && to.owner !== "shared") {
      if (from.owner !== self && from.owner !== "shared") return;
      if (to.owner !== self) return;
      const dest = { owner: to.owner, zone: to.zone } as const;
      act(
        { type: "MOVE", from, to: dest, faceUp: true },
        to.zone === "gy"
          ? { type: "sent-gy", player: self, controller: self, cardId: dragged.cardId, instanceId: dragged.instanceId }
          : { type: "banish", player: self, controller: self, cardId: dragged.cardId, instanceId: dragged.instanceId },
      );
      return;
    }
    const legal = isLegalManualMove(state, self, from, to);
    if (!legal.ok) return;
    act({ type: "MOVE", from, to, manual: true, player: self });
  }

  const phases: GameState["phase"][] = ["DP", "SP", "M1", "BP", "M2", "EP"];
  const openPile = pile ? state.players[pile.owner][pile.zone] : [];
  const botActing = Boolean(state.pve && state.activePlayer === state.pve.bot && !online.active);
  const noT1Battle = isFirstTurnStartingPlayer(state);

  return (
    <div className="duel-mat min-h-[100dvh] pb-[calc(4.5rem+env(safe-area-inset-bottom))] text-text md:pb-0">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-white/5 bg-black/35 px-2 py-2 pt-[max(0.4rem,env(safe-area-inset-top))] text-xs backdrop-blur-md md:px-3">
        <Link href={online.active ? "/play/room" : "/play"} className="min-h-9 rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10">
          Exit
        </Link>
        {bot.status && <span className="max-w-[14rem] truncate rounded-full bg-amber-300/15 px-2 py-1 text-[11px] text-amber-100">{bot.status}</span>}
        {online.active && <span className="rounded-full bg-white/10 px-2 py-1 text-[11px]">Room {online.code}</span>}
        <div>
          <div className="text-[10px] uppercase tracking-wide text-white/40">Turn {state.turn}</div>
          <div className="font-semibold leading-tight">{state.players[state.activePlayer].name}</div>
        </div>
        <div className="flex rounded-full bg-black/40 p-0.5">
          {phases.map((phase) => (
            <button
              key={phase}
              type="button"
              disabled={botActing || (phase === "BP" && noT1Battle)}
              onClick={() => {
                if (botActing || phase === state.phase) return;
                if (phase === "BP" && isFirstTurnStartingPlayer(state)) return;
                act({ type: phases.indexOf(phase) < phases.indexOf(state.phase) ? "PREV_PHASE" : "NEXT_PHASE" });
              }}
              className={cn("phase-chip", state.phase === phase && "phase-chip-on", (botActing || (phase === "BP" && noT1Battle)) && "opacity-40")}
            >
              {phase}
            </button>
          ))}
        </div>
        <button
          className="min-h-9 rounded-full bg-amber-300 px-4 py-2 font-bold text-zinc-950 disabled:opacity-40"
          disabled={botActing}
          onClick={() => act({ type: "NEXT_PHASE" })}
        >
          Next
        </button>
        <button
          className="min-h-9 rounded-lg bg-white/5 px-3 py-2 disabled:opacity-40"
          disabled={botActing}
          onClick={() => act({ type: "NEXT_TURN" })}
        >
          End
        </button>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <button className="rounded-lg bg-white/5 px-2 py-1" onClick={() => act({ type: "DRAW", player: self }, { type: "draw", player: self, controller: self })}>
            Draw
          </button>
          <button className="rounded-lg bg-white/5 px-2 py-1" onClick={() => dispatch({ type: "SHUFFLE", player: self, zone: "deck" })}>
            Shuffle
          </button>
          <button className="rounded-lg bg-white/5 px-2 py-1" onClick={() => undo()}>
            Undo
          </button>
          <button
            className={cn("rounded-lg px-2 py-1", showChain ? "bg-accent text-zinc-950" : "bg-white/5")}
            onClick={() => setShowChain((v) => !v)}
          >
            Chain{state.chain.links.length ? ` ${state.chain.links.length}` : ""}
          </button>
          <button
            type="button"
            className={cn(
              "rounded-lg px-2 py-1 font-semibold",
              autoPrompt ? "bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-300/30" : "bg-white/5 text-white/50",
            )}
            onClick={() => setAutoPrompt(!autoPrompt)}
            title="Master Duel-style activate prompts"
          >
            Auto FX {autoPrompt ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            className={cn(
              "rounded-lg px-2 py-1 font-semibold",
              rulesDebug ? "bg-sky-400/20 text-sky-100 ring-1 ring-sky-300/30" : "bg-white/5 text-white/50",
            )}
            onClick={() => setRulesDebug(!rulesDebug)}
            title="Show why responses are legal or illegal"
          >
            Rules Debug {rulesDebug ? "ON" : "OFF"}
          </button>
          {state.pve && (
            <button
              type="button"
              className={cn(
                "rounded-lg px-2 py-1 font-semibold",
                botBrain ? "bg-violet-400/20 text-violet-100 ring-1 ring-violet-300/30" : "bg-white/5 text-white/50",
              )}
              onClick={() => setBotBrain(!botBrain)}
              title="Show what combo line the bot is trying to play"
            >
              Bot Brain {botBrain ? "ON" : "OFF"}
            </button>
          )}
          {!fog && (
            <select
              value={state.view}
              onChange={(e) => dispatch({ type: "VIEW", view: e.target.value as GameState["view"] })}
              className="rounded-lg border border-white/10 bg-black/40 px-2 py-1"
            >
              <option value="god">Both hands</option>
              <option value="p1">{state.players.p1.name} eyes</option>
              <option value="p2">{state.players.p2.name} eyes</option>
            </select>
          )}
          {!lockedSeat && (
            <select value={focus} onChange={(e) => setFocus(e.target.value as PlayerId)} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1">
              <option value="p1">Seat: {state.players.p1.name}</option>
              <option value="p2">Seat: {state.players.p2.name}</option>
            </select>
          )}
        </div>
        <button type="button" className="min-h-9 rounded-lg bg-white/5 px-3 py-2 md:hidden" onClick={() => setShowMore(true)}>
          More
        </button>
        <span className="ml-auto hidden text-[10px] text-white/40 xl:inline">
          Right-click · Activate effect · drag · Esc skip
        </span>
      </header>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className={cn("grid gap-3 p-2 xl:grid-cols-[1fr_320px]", !showChain && "xl:grid-cols-1")}>
          <div className="mx-auto w-full max-w-5xl">
            <div className="mb-1 flex items-center justify-between px-2">
              <LpBlock player={oppState} active={state.activePlayer === opp} delta={lpDelta} onDelta={(n) => dispatch({ type: "SET_LP", player: opp, amount: n, mode: "delta" })} />
              <span className="text-[11px] text-white/40">Opp ED {oppState.extra.length}</span>
            </div>
            {attackFrom && (
              <div className="mb-2 rounded-2xl border border-rose-300/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-100">
                Choose an opponent monster for {attackFrom.name ?? "your attacker"} to attack.
                <button type="button" className="ml-2 underline" onClick={() => setAttackFrom(null)}>
                  Cancel
                </button>
              </div>
            )}
            {state.chain.links.length > 0 && (
              <div className="mb-2 rounded-2xl border border-amber-200/20 bg-black/40 px-3 py-2 text-xs">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-semibold text-amber-100">
                    Chain · {state.chain.links.length}
                    {state.chain.complete ? " · resolving" : ""}
                  </span>
                  <span className="flex gap-1">
                    {(rulesDebug || online.active) && (
                      <>
                        <button type="button" className="rounded-lg bg-white/10 px-2 py-1" onClick={() => dispatch({ type: "CHAIN_PASS", player: self })}>
                          Pass
                        </button>
                        {rulesDebug && (
                          <button
                            type="button"
                            className="rounded-lg bg-amber-300 px-2 py-1 font-semibold text-zinc-950"
                            onClick={() => dispatch({ type: "CHAIN_RESOLVE_ONE" })}
                          >
                            Resolve
                          </button>
                        )}
                      </>
                    )}
                    <button type="button" className="rounded-lg bg-white/10 px-2 py-1" onClick={() => setShowChain(true)}>
                      Details
                    </button>
                  </span>
                </div>
                <div className="space-y-0.5 text-white/70">
                  {[...state.chain.links].reverse().slice(0, 4).map((link) => (
                    <div key={link.id}>
                      {link.link}. {link.cardName}
                      {link.label ? ` — ${link.label}` : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <HandStrip
              cards={oppState.hand}
              byId={byId}
              reveal={revealOpp}
              selectedId={selected?.instanceId}
              owner={opp}
              opponent
              onCardClick={(c) => {
                if (fog && !revealOpp) return;
                onCardTap(c, "hand", opp);
              }}
              onCardMenu={(c, e) => {
                if (fog && !revealOpp) return;
                openMenu(c, "hand", opp, { x: e.clientX, y: e.clientY });
              }}
            />

            <div className="overflow-x-auto rounded-[32px] border border-white/8 bg-black/20 px-2 py-3 shadow-[inset_0_0_80px_rgba(0,0,0,.35)]">
              <div className="mx-auto grid min-w-[34rem] grid-cols-[auto_1fr_auto] gap-2 md:min-w-0">
                <SideColumn
                  owner={opp}
                  state={state}
                  byId={byId}
                  self={false}
                  concealPrivate={fog}
                  selectedId={selected?.instanceId}
                  onOpenPile={(o, z) => {
                    if (fog && o === opp && (z === "deck" || z === "extra")) return;
                    setPile({ owner: o, zone: z });
                  }}
                  onCardClick={(c) => onCardTap(c, whereOf(c), ownerOf(c))}
                  onCardMenu={(c, e) => openMenu(c, whereOf(c), ownerOf(c), { x: e.clientX, y: e.clientY })}
                />
                <div className="space-y-1.5">
                  <SpellRow
                    owner={opp}
                    cards={oppState.spells}
                    byId={byId}
                    selectedId={selected?.instanceId}
                    dragDisabled
                    onCardClick={(c) => onCardTap(c, "st", opp)}
                    onCardMenu={(c, e) => openMenu(c, "st", opp, { x: e.clientX, y: e.clientY })}
                  />
                  <MonsterRow
                    owner={opp}
                    cards={oppState.monsters}
                    byId={byId}
                    selectedId={selected?.instanceId}
                    dragDisabled
                    onCardClick={(c) => onCardTap(c, "field", opp)}
                    onCardMenu={(c, e) => openMenu(c, "field", opp, { x: e.clientX, y: e.clientY })}
                  />
                  <EmzRow
                    state={state}
                    byId={byId}
                    selectedId={selected?.instanceId}
                    onCardClick={(c) => onCardTap(c, "field", self)}
                    onCardMenu={(c, e) => openMenu(c, "field", self, { x: e.clientX, y: e.clientY })}
                  />
                  <MonsterRow
                    owner={self}
                    cards={selfState.monsters}
                    byId={byId}
                    selectedId={selected?.instanceId}
                    onCardClick={(c) => onCardTap(c, "field", self)}
                    onCardMenu={(c, e) => openMenu(c, "field", self, { x: e.clientX, y: e.clientY })}
                  />
                  <SpellRow
                    owner={self}
                    cards={selfState.spells}
                    byId={byId}
                    selectedId={selected?.instanceId}
                    onCardClick={(c) => onCardTap(c, "st", self)}
                    onCardMenu={(c, e) => openMenu(c, "st", self, { x: e.clientX, y: e.clientY })}
                  />
                </div>
                <SideColumn
                  owner={self}
                  state={state}
                  byId={byId}
                  self
                  selectedId={selected?.instanceId}
                  onOpenPile={(o, z) => setPile({ owner: o, zone: z })}
                  onCardClick={(c) => onCardTap(c, whereOf(c), ownerOf(c))}
                  onCardMenu={(c, e) => openMenu(c, whereOf(c), ownerOf(c), { x: e.clientX, y: e.clientY })}
                />
              </div>
            </div>

            <HandStrip
              cards={selfState.hand}
              byId={byId}
              reveal={revealSelf}
              selectedId={selected?.instanceId}
              owner={self}
              onCardClick={(c) => onCardTap(c, "hand", self)}
              onCardMenu={(c, e) => openMenu(c, "hand", self, { x: e.clientX, y: e.clientY })}
            />

            <div className="mt-1 flex items-center justify-between px-2">
              <LpBlock
                player={selfState}
                active={state.activePlayer === self}
                delta={lpDelta}
                onChangeDelta={setLpDelta}
                onDelta={(n) => dispatch({ type: "SET_LP", player: self, amount: n, mode: "delta" })}
              />
              <div className="flex gap-1 text-[11px]">
                <button className="rounded bg-white/5 px-2 py-1" onClick={() => dispatch({ type: "DICE" })}>
                  Dice {state.lastRoll?.kind === "dice" ? state.lastRoll.value : ""}
                </button>
                <button className="rounded bg-white/5 px-2 py-1" onClick={() => dispatch({ type: "COIN" })}>
                  Coin {state.lastRoll?.kind === "coin" ? state.lastRoll.value : ""}
                </button>
                <button className="rounded bg-white/5 px-2 py-1" onClick={() => dispatch({ type: "TOKEN", player: self })}>
                  Token
                </button>
                <button className="rounded bg-white/5 px-2 py-1" onClick={() => dispatch({ type: "RESET_HANDS", draw: 5 })}>
                  Reset
                </button>
              </div>
            </div>
          </div>

          {showChain && (
            <div className="max-h-[calc(100vh-4rem)] overflow-auto">
              <ChainPanel state={state} />
              <div className="mt-2 max-h-40 overflow-auto rounded-xl border border-line bg-bg-elev p-2 text-[11px] text-muted">
                {state.log.slice(0, 12).map((e) => (
                  <div key={e.id}>{e.text}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DragOverlay>
          {activeCard ? (
            <BoardCard card={activeCard} data={byId.get(activeCard.cardId)} compact static />
          ) : null}
        </DragOverlay>
      </DndContext>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 gap-1 border-t border-white/10 bg-black/85 px-1 py-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        {(
          [
            ["Draw", () => act({ type: "DRAW", player: self }, { type: "draw", player: self, controller: self })],
            ["Chain", () => setShowChain((v) => !v)],
            ["Seat", () => setFocus((f) => (f === "p1" ? "p2" : "p1"))],
            ["FX", () => setAutoPrompt(!autoPrompt)],
            ["More", () => setShowMore(true)],
          ] as const
        ).map(([label, fn]) => (
          <button key={label} type="button" className="min-h-12 rounded-xl bg-white/5 text-xs font-medium" onClick={fn}>
            {label}
            {label === "Chain" && state.chain.links.length ? ` ${state.chain.links.length}` : ""}
            {label === "FX" ? (autoPrompt ? " on" : " off") : ""}
          </button>
        ))}
      </nav>

      {showMore && (
        <div className="fixed inset-0 z-[65]" onClick={() => setShowMore(false)}>
          <div
            className="absolute inset-x-0 bottom-0 space-y-2 rounded-t-3xl border border-white/10 bg-[#121a2c] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-white/25" />
            <h2 className="text-sm font-semibold">Table tools</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <button className="min-h-11 rounded-xl bg-white/5" onClick={() => undo()}>Undo</button>
              <button className="min-h-11 rounded-xl bg-white/5" onClick={() => dispatch({ type: "SHUFFLE", player: self, zone: "deck" })}>Shuffle</button>
              <button className="min-h-11 rounded-xl bg-white/5" onClick={() => dispatch({ type: "DICE" })}>Dice</button>
              <button className="min-h-11 rounded-xl bg-white/5" onClick={() => dispatch({ type: "COIN" })}>Coin</button>
              <button className="min-h-11 rounded-xl bg-white/5" onClick={() => dispatch({ type: "TOKEN", player: self })}>Token</button>
              <button className="min-h-11 rounded-xl bg-white/5" onClick={() => dispatch({ type: "RESET_HANDS", draw: 5 })}>Reset hands</button>
            </div>
            <label className="block text-xs text-muted">
              View
              <select
                value={state.view}
                onChange={(e) => dispatch({ type: "VIEW", view: e.target.value as GameState["view"] })}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-text"
              >
                <option value="god">Both hands</option>
                <option value="p1">{state.players.p1.name} eyes</option>
                <option value="p2">{state.players.p2.name} eyes</option>
              </select>
            </label>
            <label className="block text-xs text-muted">
              Seat
              <select
                value={focus}
                onChange={(e) => setFocus(e.target.value as PlayerId)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-text"
              >
                <option value="p1">{state.players.p1.name}</option>
                <option value="p2">{state.players.p2.name}</option>
              </select>
            </label>
            <button type="button" className="min-h-11 w-full rounded-xl bg-accent font-semibold text-zinc-950" onClick={() => setShowMore(false)}>
              Done
            </button>
          </div>
        </div>
      )}

      {scaledSendUi && state && (
        <CostPicker
          title={`Summon ${scaledSendUi.summonName}`}
          heading="Send to GY"
          spec={{
            id: "scaled-send",
            kind: "send",
            count: scaledSendUi.need,
            source: "hand-or-field",
            self: false,
            otherOnly: false,
            typeHint: "any",
            label: `Send ${scaledSendUi.need} ${scaledSendUi.archetypes.join("/")} (${scaledSendUi.label})`,
          }}
          range={{ min: scaledSendUi.need, max: scaledSendUi.need }}
          candidates={sinfulSpoilsSendCandidates(state, scaledSendUi.owner, scaledSendUi.archetypes, byId).map((ref) => {
            const card =
              ref.zone === "hand" && typeof ref.index === "number"
                ? state.players[scaledSendUi.owner].hand[ref.index]
                : ref.zone === "st" && typeof ref.index === "number"
                  ? state.players[scaledSendUi.owner].spells[ref.index]
                  : ref.zone === "field"
                    ? state.players[scaledSendUi.owner].field
                    : null;
            const data = card ? byId.get(card.cardId) : undefined;
            return {
              ref,
              data,
              label: `${data?.name ?? "Card"} · ${ref.zone}`,
              instanceId: card?.instanceId ?? `${ref.zone}-${"index" in ref ? ref.index : 0}`,
            };
          })}
          onCancel={() => {
            const { instanceId, data, cardActivation } = scaledSendUi;
            setScaledSendUi(null);
            settleActivatedCard(instanceId, data, cardActivation);
          }}
          onConfirm={(picks) => {
            if (picks.length < scaledSendUi.need) return;
            for (const ref of picks.slice(0, scaledSendUi.need)) {
              dispatch({ type: "MOVE", from: ref, to: { owner: scaledSendUi.owner, zone: "gy" }, faceUp: true });
            }
            const ui = scaledSendUi;
            setScaledSendUi(null);
            const now = useGameStore.getState().current;
            const ed = now?.players[ui.owner].extra ?? [];
            const inst = now ? peekCard(now, ui.summonFrom)?.instanceId : undefined;
            const useIndex = inst ? ed.findIndex((c) => c.instanceId === inst) : ui.summonFrom.index;
            const from = { owner: ui.owner, zone: "extra" as const, index: useIndex >= 0 ? useIndex : ui.summonFrom.index };
            const piece = now ? peekCard(now, from) : null;
            act(
              {
                type: "PLAY",
                from,
                player: ui.owner,
                mode: "summon-atk",
                special: true,
                effectSummon: true,
              },
              {
                type: "summon",
                player: ui.owner,
                controller: ui.owner,
                cardId: piece?.cardId,
                instanceId: piece?.instanceId,
                summonKind: "special",
              },
            );
            if (ui.rest.length) openSearchQueue(ui.owner, ui.rest, ui.title, ui.instanceId, ui.data, ui.cardActivation);
            else settleActivatedCard(ui.instanceId, ui.data, ui.cardActivation);
          }}
        />
      )}

      {handSSUi && state && handSSUi.spec.cost && (
        <CostPicker
          title={handSSUi.data.name}
          spec={handSSUi.spec.cost}
          lp={state.players[handSSUi.owner].lp}
          candidates={costCandidates(state, handSSUi.owner, handSSUi.spec.cost, handSSUi.card.instanceId, byId).map((c) => ({
            ref: c.ref,
            data: c.data,
            label: c.label,
            instanceId: c.card.instanceId,
          }))}
          onCancel={() => setHandSSUi(null)}
          onConfirm={(picks) => {
            const spec = handSSUi.spec.cost!;
            applyCost(handSSUi.owner, spec, handSSUi.card.instanceId, picks.slice(0, Math.max(1, spec.count)));
            const live = useGameStore.getState().current;
            const ref = live ? findCardRef(live, handSSUi.card.instanceId) : null;
            if (ref) {
              act(
                { type: "PLAY", from: ref, player: handSSUi.owner, mode: "summon-atk", special: true },
                {
                  type: "summon",
                  player: handSSUi.owner,
                  controller: handSSUi.owner,
                  cardId: handSSUi.card.cardId,
                  instanceId: handSSUi.card.instanceId,
                  summonKind: "special",
                },
              );
            }
            setHandSSUi(null);
          }}
        />
      )}

      {tributeUi && state && (
        <CostPicker
          title={`Tribute for ${tributeUi.data.name}`}
          spec={{
            id: "tribute-ns",
            kind: "tribute",
            count: tributeUi.need,
            source: "field",
            self: false,
            otherOnly: false,
            typeHint: "monster",
            label: `Tribute ${tributeUi.need} monster${tributeUi.need > 1 ? "s" : ""}`,
          }}
          candidates={fieldMonsterRefs(state, tributeUi.owner).map((row) => ({
            ref: row.ref,
            data: byId.get(row.card.cardId),
            label: byId.get(row.card.cardId)?.name ?? row.card.name ?? "Monster",
            instanceId: row.card.instanceId,
          }))}
          onCancel={() => setTributeUi(null)}
          onConfirm={(picks) => {
            if (picks.length < tributeUi.need) return;
            act(
              {
                type: "PLAY",
                from: tributeUi.from,
                player: tributeUi.owner,
                mode: tributeUi.mode,
                tributes: picks.slice(0, tributeUi.need),
              },
              tributeUi.event,
            );
            setTributeUi(null);
          }}
        />
      )}

      {extraUi && state && (
        <div className="fixed inset-0 z-[76]">
          {extraUi.specs.length > 1 && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-[77] flex justify-center px-3">
              <div className="pointer-events-auto flex max-w-xl flex-wrap gap-1 rounded-2xl border border-amber-200/25 bg-[#0c1524]/95 p-1">
                {extraUi.specs.map((spec, i) => (
                  <button
                    key={spec.id}
                    type="button"
                    className={`rounded-xl px-3 py-1.5 text-[11px] ${extraUi.specIndex === i ? "bg-amber-300 font-semibold text-zinc-950" : "text-white/70"}`}
                    onClick={() => setExtraUi({ ...extraUi, specIndex: i })}
                  >
                    {spec.id === "fusion" ? "Fusion Summon" : spec.id.startsWith("alt") ? "Banish SS" : spec.kind}
                  </button>
                ))}
              </div>
            </div>
          )}
          <CostPicker
            title={`${extraUi.data.name}`}
            spec={{
              id: "extra-mats",
              kind: "tribute",
              count: extraUi.specs[extraUi.specIndex]!.minCount,
              source: "field",
              self: false,
              otherOnly: false,
              typeHint: "monster",
              label: extraUi.specs[extraUi.specIndex]!.label,
            }}
            range={{ min: extraUi.specs[extraUi.specIndex]!.minCount, max: extraUi.specs[extraUi.specIndex]!.maxCount }}
            candidates={extraMaterialCandidates(state, extraUi.owner, extraUi.specs[extraUi.specIndex]!, byId).map((row) => ({
              ref: row.ref,
              data: row.data,
              label: `${row.data.name} · ${row.where}${row.data.level != null ? ` · Lv${row.data.level}` : ""}${row.data.race ? ` ${row.data.race}` : ""}`,
              instanceId: row.card.instanceId,
            }))}
            onCancel={() => setExtraUi(null)}
            onConfirm={(picks) => {
              const spec = extraUi.specs[extraUi.specIndex]!;
              const rows = extraMaterialCandidates(state, extraUi.owner, spec, byId).filter((r) =>
                picks.some((p) => {
                  const pi = "index" in p ? p.index : undefined;
                  const ri = "index" in r.ref ? r.ref.index : undefined;
                  return p.zone === r.ref.zone && p.owner === r.ref.owner && pi === ri;
                }),
              );
              const check = validateExtraMaterials(spec, rows, state, extraUi.owner, byId);
              if (!check.ok) return;
              act(
                {
                  type: "PLAY",
                  from: extraUi.from,
                  player: extraUi.owner,
                  mode: extraUi.mode,
                  special: true,
                  materials: rows.map((r) => r.ref),
                  materialsMode: spec.materialsMode ?? (spec.kind === "xyz" ? "overlay" : "gy"),
                },
                extraUi.event,
              );
              setExtraUi(null);
              setPile(null);
            }}
          />
        </div>
      )}

      {targetUi && state && (
        <CostPicker
          title={targetUi.title}
          heading="Choose target"
          spec={{
            id: "target",
            kind: "tribute",
            count: targetUi.spec.count,
            source: "field",
            self: false,
            otherOnly: true,
            typeHint: "monster",
            label: targetUi.spec.label,
          }}
          candidates={effectTargetCandidates(state, targetUi.owner, targetUi.spec, byId).map((c) => ({
            ref: c.ref,
            data: c.data,
            label: c.label,
            instanceId: c.card.instanceId,
          }))}
          onCancel={() => setTargetUi(null)}
          onConfirm={(picks) => {
            const ids = picks
              .map((p) => peekCard(state, p)?.instanceId)
              .filter((id): id is string => Boolean(id));
            if (!ids.length) return;
            finishEffectAfterCosts({
              owner: targetUi.owner,
              data: targetUi.data,
              instanceId: targetUi.selfId,
              doChain: targetUi.doChain,
              speed: targetUi.speed,
              kind: targetUi.kind,
              label: targetUi.label,
              search: targetUi.search,
              searches: targetUi.searches,
              clauseIndex: targetUi.clauseIndex,
              cardActivation: targetUi.cardActivation,
              effectDamage: targetUi.effectDamage,
              negatesPrevious: targetUi.negatesPrevious,
              negateMonsterUntilEot: targetUi.negateMonsterUntilEot,
              targetInstanceIds: ids,
            });
            setTargetUi(null);
          }}
        />
      )}

      {costUi && state && (
        <CostPicker
          title={costUi.title}
          spec={costUi.spec}
          range={costUi.costRange}
          lp={state.players[costUi.owner].lp}
          candidates={costCandidates(state, costUi.owner, costUi.spec, costUi.selfId, byId).map((c) => ({
            ref: c.ref,
            data: c.data,
            label: c.label,
            instanceId: c.card.instanceId,
          }))}
          onCancel={() => setCostUi(null)}
          onConfirm={(picks) => {
            applyCost(costUi.owner, costUi.spec, costUi.selfId, picks);
            const rest = costUi.queue;
            if (!rest.length) {
              const done = () =>
                finishEffectAfterCosts({
                  owner: costUi.owner,
                  data: costUi.data,
                  instanceId: costUi.selfId,
                  doChain: costUi.doChain,
                  speed: costUi.speed,
                  kind: costUi.kind,
                  label: costUi.label,
                  search: costUi.search,
                  searches: costUi.searches,
                  clauseIndex: costUi.clauseIndex,
                  cardActivation: costUi.cardActivation,
                  effectDamage: costUi.effectDamage,
                  negatesPrevious: costUi.negatesPrevious,
                  negateMonsterUntilEot: costUi.negateMonsterUntilEot,
                  targetInstanceIds: costUi.targetInstanceIds,
                });
              if (costUi.targetSpec && !costUi.targetInstanceIds?.length) {
                const cur = liveState() ?? state;
                const cands = cur ? effectTargetCandidates(cur, costUi.owner, costUi.targetSpec, byId) : [];
                if (cands.length === 1) {
                  finishEffectAfterCosts({
                    owner: costUi.owner,
                    data: costUi.data,
                    instanceId: costUi.selfId,
                    doChain: costUi.doChain,
                    speed: costUi.speed,
                    kind: costUi.kind,
                    label: costUi.label,
                    search: costUi.search,
                    searches: costUi.searches,
                    clauseIndex: costUi.clauseIndex,
                    cardActivation: costUi.cardActivation,
                    effectDamage: costUi.effectDamage,
                    negatesPrevious: costUi.negatesPrevious,
                    negateMonsterUntilEot: costUi.negateMonsterUntilEot,
                    targetInstanceIds: [cands[0]!.card.instanceId],
                  });
                } else if (cur && cands.length) {
                  setTargetUi({
                    owner: costUi.owner,
                    selfId: costUi.selfId,
                    spec: costUi.targetSpec,
                    title: costUi.title,
                    data: costUi.data,
                    clauseIndex: costUi.clauseIndex,
                    doChain: costUi.doChain,
                    speed: costUi.speed,
                    kind: costUi.kind,
                    label: costUi.label,
                    search: costUi.search,
                    searches: costUi.searches,
                    cardActivation: costUi.cardActivation,
                    effectDamage: costUi.effectDamage,
                    negatesPrevious: costUi.negatesPrevious,
                    negateMonsterUntilEot: costUi.negateMonsterUntilEot,
                  });
                } else {
                  done();
                }
              } else {
                done();
              }
              setCostUi(null);
              return;
            }
            const [head, ...queue] = rest;
            setCostUi({ ...costUi, spec: head, queue });
          }}
        />
      )}

      {searchUi && state && (
        <SearchPicker
          title={searchUi.title}
          spec={searchUi.spec}
          sourceLabel={(searchUi.spec.sources?.length ? searchUi.spec.sources : [searchUi.spec.source]).join(" / ")}
          candidates={findSearchCandidates(state, searchUi.owner, searchUi.spec, byId)}
          onCancel={() => {
            const { instanceId, data, cardActivation } = searchUi;
            setSearchUi(null);
            settleActivatedCard(instanceId, data, cardActivation);
          }}
          onPick={(index, _data, source) => {
            const rest = searchUi.queue;
            const title = searchUi.title;
            const owner = searchUi.owner;
            const spec = searchUi.spec;
            const instanceId = searchUi.instanceId;
            const data = searchUi.data;
            const cardActivation = searchUi.cardActivation;
            setSearchUi(null);
            resolveSearchPick(owner, spec, index, rest, title, instanceId, data, cardActivation, source);
          }}
        />
      )}

      {choiceUi && (
        <div className="fixed inset-0 z-[78] grid place-items-end sm:place-items-center">
          <button type="button" className="absolute inset-0 bg-black/75" onClick={() => setChoiceUi(null)} aria-label="Cancel" />
          <div className="relative z-[79] w-full max-w-lg rounded-t-3xl border border-amber-200/25 bg-[#0c1524] p-4 shadow-2xl sm:rounded-3xl">
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/80">Choose 1 effect</p>
            <h2 className="mt-1 text-center text-lg font-semibold">{choiceUi.title}</h2>
            <div className="mt-3 space-y-2">
              {choiceUi.options.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  className="block min-h-12 w-full rounded-xl bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
                  onClick={() => {
                    const { owner, rest, instanceId, data, cardActivation } = choiceUi;
                    setChoiceUi(null);
                    runOpsQueue(owner, [...opt.ops, ...rest], instanceId, data, cardActivation);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {excavateUi && state && (
        <div className="fixed inset-0 z-[78] grid place-items-end sm:place-items-center">
          <button type="button" className="absolute inset-0 bg-black/75" onClick={() => { setExcavateUi(null); settleActivatedCard(excavateUi.instanceId, excavateUi.data, excavateUi.cardActivation); }} aria-label="Skip excavate" />
          <div className="relative z-[79] w-full max-w-2xl rounded-t-3xl border border-amber-200/25 bg-[#0c1524] p-4 shadow-2xl sm:rounded-3xl">
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/80">{excavateUi.op.label}</p>
            <p className="mt-1 text-center text-sm text-white/60">Tap a legal card to add; the rest stay on top in the same order.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {excavateUi.cards.map((card, i) => {
                const d = byId.get(card.cardId);
                const legal = Boolean(d && excavateUi.op.addIf && cardMatchesSearch(d, excavateUi.op.addIf));
                return (
                  <button
                    key={card.instanceId}
                    type="button"
                    disabled={!legal}
                    className={`w-20 rounded-lg border p-1 text-[10px] ${legal ? "border-amber-300/50 bg-white/10" : "border-white/10 opacity-40"}`}
                    onClick={() => {
                      const idx = state.players[excavateUi.owner].deck.findIndex((c) => c.instanceId === card.instanceId);
                      if (idx >= 0) dispatch({ type: "MOVE", from: { owner: excavateUi.owner, zone: "deck", index: idx }, to: { owner: excavateUi.owner, zone: "hand" }, faceUp: true });
                      const { owner, rest, instanceId, data, cardActivation } = excavateUi;
                      setExcavateUi(null);
                      runOpsQueue(owner, rest, instanceId, data, cardActivation);
                    }}
                  >
                    {d?.name ?? `#${i + 1}`}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="mt-3 w-full rounded-xl border border-white/15 py-2 text-sm text-white/70"
              onClick={() => {
                const { owner, rest, instanceId, data, cardActivation } = excavateUi;
                setExcavateUi(null);
                runOpsQueue(owner, rest, instanceId, data, cardActivation);
              }}
            >
              Add none
            </button>
          </div>
        </div>
      )}

      {declareUi && (
        <div className="fixed inset-0 z-[78] grid place-items-end sm:place-items-center">
          <button type="button" className="absolute inset-0 bg-black/75" onClick={() => setDeclareUi(null)} aria-label="Cancel declare" />
          <div className="relative z-[79] max-h-[80dvh] w-full max-w-lg overflow-auto rounded-t-3xl border border-amber-200/25 bg-[#0c1524] p-4 shadow-2xl sm:rounded-3xl">
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/80">{declareUi.op.label}</p>
            <div className="mt-3 grid max-h-[50dvh] gap-1 overflow-auto">
              {declareUi.names.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="rounded-lg bg-white/5 px-3 py-2 text-left text-sm hover:bg-white/10"
                  onClick={() => {
                    const { owner, op, rest, instanceId, data, cardActivation } = declareUi;
                    setDeclareUi(null);
                    resolveDeclaredName(owner, n, op, rest, instanceId, data, cardActivation);
                  }}
                >
                  {n}
                </button>
              ))}
              {!declareUi.names.length && <p className="py-6 text-center text-sm text-white/50">No legal names.</p>}
            </div>
          </div>
        </div>
      )}

      {fusionSpellUi && state && (
        <div className="fixed inset-0 z-[78] grid place-items-end sm:place-items-center">
          <button type="button" className="absolute inset-0 bg-black/75" onClick={() => setFusionSpellUi(null)} aria-label="Cancel fusion" />
          <div className="relative z-[79] max-h-[85dvh] w-full max-w-2xl overflow-auto rounded-t-3xl border border-amber-200/25 bg-[#0c1524] p-4 shadow-2xl sm:rounded-3xl">
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200/80">{fusionSpellUi.op.label}</p>
            {fusionSpellUi.step === "pick-target" && fusionSpellUi.op.kind === "gaze-fusion" && (
              <div className="mt-3 grid gap-1">
                {[...state.players[fusionSpellUi.owner].monsters.filter(Boolean), ...state.players[fusionSpellUi.owner].gy]
                  .filter((c): c is ZoneCard => Boolean(c) && fusionSpellUi.op.kind === "gaze-fusion" && fusionSpellUi.op.targetNames.some((n) => (byId.get(c!.cardId)?.name ?? "").toLowerCase() === n.toLowerCase()))
                  .map((c) => (
                    <button
                      key={c.instanceId}
                      type="button"
                      className="rounded-lg bg-white/5 px-3 py-2 text-left text-sm"
                      onClick={() => setFusionSpellUi({ ...fusionSpellUi, step: "pick-ed", target: c })}
                    >
                      {byId.get(c.cardId)?.name}
                    </button>
                  ))}
              </div>
            )}
            {fusionSpellUi.step === "pick-ed" && (
              <div className="mt-3 grid gap-1">
                {state.players[fusionSpellUi.owner].extra
                  .map((c) => ({ c, d: byId.get(c.cardId) }))
                  .filter(({ d }) => {
                    if (!d || cardKind(d) !== "fusion") return false;
                    if (fusionSpellUi.op.kind === "gaze-fusion" && fusionSpellUi.target) {
                      return fusionMentionsMaterial(d, byId.get(fusionSpellUi.target.cardId)?.name ?? "");
                    }
                    if (fusionSpellUi.op.kind === "fusion-spell") {
                      if (fusionSpellUi.op.race && (d.race ?? "").toLowerCase() !== fusionSpellUi.op.race.toLowerCase()) return false;
                      if (fusionSpellUi.op.mentions?.length && !fusionSpellUi.op.mentions.some((n) => fusionMentionsMaterial(d, n))) return false;
                      return true;
                    }
                    if (fusionSpellUi.op.kind === "ritual-spell") return false;
                    return true;
                  })
                  .concat(
                    fusionSpellUi.op.kind === "ritual-spell"
                      ? state.players[fusionSpellUi.owner].hand
                          .map((c) => ({ c, d: byId.get(c.cardId) }))
                          .filter(({ d }) => d && d.type.toLowerCase().includes("ritual") && d.type.toLowerCase().includes("monster"))
                      : [],
                  )
                  .map(({ c, d }) => (
                    <button
                      key={c.instanceId}
                      type="button"
                      className="rounded-lg bg-white/5 px-3 py-2 text-left text-sm"
                      onClick={() => {
                        if (fusionSpellUi.op.kind === "gaze-fusion" && fusionSpellUi.target) {
                          const tref = findCardRef(state, fusionSpellUi.target.instanceId);
                          if (tref) dispatch({ type: "MOVE", from: tref, to: { owner: fusionSpellUi.owner, zone: "deck", index: 0 }, faceUp: false });
                          const eref = findCardRef(useGameStore.getState().current ?? state, c.instanceId);
                          if (eref) {
                            act(
                              { type: "PLAY", from: eref, player: fusionSpellUi.owner, mode: "summon-atk", special: true, effectSummon: true },
                              { type: "summon", player: fusionSpellUi.owner, controller: fusionSpellUi.owner, cardId: c.cardId, instanceId: c.instanceId, summonKind: "special" },
                            );
                          }
                          const { owner, rest, instanceId, data, cardActivation } = fusionSpellUi;
                          setFusionSpellUi(null);
                          runOpsQueue(owner, rest, instanceId, data, cardActivation);
                          return;
                        }
                        setFusionSpellUi({ ...fusionSpellUi, step: "pick-mats", edPick: c });
                      }}
                    >
                      {d?.name}
                    </button>
                  ))}
              </div>
            )}
            {fusionSpellUi.step === "pick-mats" && fusionSpellUi.edPick && (
              <CostPicker
                title={`Materials for ${byId.get(fusionSpellUi.edPick.cardId)?.name ?? "Fusion"}`}
                heading="Choose materials"
                spec={{
                  id: "fusion-mats",
                  kind: "tribute",
                  count: fusionSpellUi.op.kind === "fusion-spell" ? fusionSpellUi.op.minCount : 2,
                  source: "hand-or-field",
                  self: false,
                  otherOnly: false,
                  typeHint: "monster",
                  label: "Fusion materials",
                }}
                range={
                  fusionSpellUi.op.kind === "fusion-spell"
                    ? { min: fusionSpellUi.op.minCount, max: fusionSpellUi.op.maxCount }
                    : { min: 1, max: 8 }
                }
                candidates={(() => {
                  const owner = fusionSpellUi.owner;
                  const p = state.players[owner];
                  const rows: Array<{ ref: import("@/lib/game/types").ZoneRef; data?: CompactCard; label: string; instanceId: string }> = [];
                  const add = (card: ZoneCard, ref: import("@/lib/game/types").ZoneRef, where: string) => {
                    const d = byId.get(card.cardId);
                    if (!d || !isMonster(d)) return;
                    rows.push({ ref, data: d, label: `${d.name} · ${where}`, instanceId: card.instanceId });
                  };
                  const from = fusionSpellUi.op.kind === "fusion-spell" ? fusionSpellUi.op.from : fusionSpellUi.op.kind === "ritual-spell" ? fusionSpellUi.op.from : ["hand", "field"];
                  if (from.includes("hand")) p.hand.forEach((c, i) => add(c, { owner, zone: "hand", index: i }, "hand"));
                  if (from.includes("field")) p.monsters.forEach((c, i) => c && add(c, { owner, zone: "monster", index: i }, "field"));
                  if (from.includes("gy")) p.gy.forEach((c, i) => add(c, { owner, zone: "gy", index: i }, "GY"));
                  if (from.includes("banish")) p.banish.forEach((c, i) => add(c, { owner, zone: "banish", index: i }, "banish"));
                  if (from.includes("deck")) p.deck.forEach((c, i) => add(c, { owner, zone: "deck", index: i }, "deck"));
                  return rows;
                })()}
                onCancel={() => setFusionSpellUi(null)}
                onConfirm={(picks) => {
                  const ui = fusionSpellUi;
                  const ed = ui.edPick!;
                  const shuffle = ui.op.kind === "fusion-spell" && ui.op.shuffleMaterials;
                  for (const ref of picks) {
                    dispatch({
                      type: "MOVE",
                      from: ref,
                      to: { owner: ui.owner, zone: shuffle ? "deck" : "gy" },
                      faceUp: shuffle ? false : true,
                    });
                  }
                  if (shuffle) dispatch({ type: "SHUFFLE", player: ui.owner, zone: "deck" });
                  const now = useGameStore.getState().current ?? state;
                  const eref = findCardRef(now, ed.instanceId);
                  if (eref) {
                    act(
                      {
                        type: "PLAY",
                        from: eref,
                        player: ui.owner,
                        mode: "summon-atk",
                        special: true,
                        effectSummon: true,
                      },
                      {
                        type: "summon",
                        player: ui.owner,
                        controller: ui.owner,
                        cardId: ed.cardId,
                        instanceId: ed.instanceId,
                        summonKind: "special",
                      },
                    );
                  }
                  setFusionSpellUi(null);
                  runOpsQueue(ui.owner, ui.rest, ui.instanceId, ui.data, ui.cardActivation);
                }}
              />
            )}
          </div>
        </div>
      )}

      {(prompts[0] || legalResponses.length > 0) && (
        <ActivationPrompt
          prompt={prompts[0] ?? null}
          card={prompts[0] ? byId.get(prompts[0].cardId) : legalResponses[0]?.data}
          remaining={prompts.length}
          chain={state.chain.links}
          pendingName={state.chain.pendingPlayer ? state.players[state.chain.pendingPlayer].name : undefined}
          legalResponses={legalResponses}
          onView={() => {
            const id = prompts[0]?.cardId ?? legalResponses[0]?.data.id;
            const c = id != null ? byId.get(id) : undefined;
            if (c) openCard(c);
          }}
          onViewZoneCard={(c) => openCard(c)}
          onYes={() => onPromptYes()}
          onNo={() => onPromptNo()}
          onSkipRest={() => setPrompts([])}
          onPass={() => dispatch({ type: "CHAIN_PASS", player: self })}
          onActivateResponse={(row) => {
            if (row.opt.mode === "card") runAction("activate-st", row.card, self, row.where, row.opt);
            else runAction("chain", row.card, self, row.where, row.opt);
          }}
        />
      )}

      {botBrain && state?.pve && (
        <div className="pointer-events-none fixed right-2 top-16 z-[61] max-h-[50vh] w-[min(100%-1rem,22rem)] overflow-auto rounded-xl border border-violet-300/30 bg-[#120718]/90 p-2 text-[10px] text-violet-50 shadow-xl">
          <div className="pointer-events-auto font-semibold uppercase tracking-wide text-violet-200">Bot Brain</div>
          <ul className="mt-1 space-y-1.5">
            {botThoughts.map((t, i) => (
              <li key={`${t.at}-${i}`} className="text-violet-100/90">
                <div className="font-semibold text-violet-50">{t.note}</div>
                <div className="text-violet-200/70">Plan: {t.plan}</div>
                <div className="text-white/45">{t.why}</div>
                <div className="text-white/35">{t.board}</div>
              </li>
            ))}
            {!botThoughts.length && <li className="text-white/40">Waiting for bot decisions…</li>}
          </ul>
        </div>
      )}

      {rulesDebug && state && (
        <div className="pointer-events-none fixed left-2 top-16 z-[61] max-h-[55vh] w-[min(100%-1rem,24rem)] overflow-auto rounded-xl border border-sky-300/30 bg-[#071018]/90 p-2 text-[10px] text-sky-50 shadow-xl">
          <div className="pointer-events-auto font-semibold uppercase tracking-wide text-sky-200">Chain & Activation Debug</div>
          <div className="mt-1 text-white/60">
            FET {state.fetBox} · pending {state.chain.pendingPlayer ?? "—"} · used FX {state.effectsUsedThisTurn?.length ?? 0}
            {state.pve ? " · bot duel" : state.pvp ? " · friend duel" : " · local"}
          </div>
          {menuDenial.length > 0 && menu && (
            <div className="mt-2 rounded bg-black/40 p-1.5 text-amber-100/90">
              <div className="font-semibold text-amber-200">Selected: {byId.get(menu.card.cardId)?.name ?? menu.card.name}</div>
              {menuDenial.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
          <div className="mt-2 font-semibold text-sky-200/80">Attempts</div>
          <ul className="mt-1 space-y-1">
            {debugTraces.map((row) => (
              <li key={row.id} className={row.allowed ? "text-emerald-200/90" : "text-rose-200/85"}>
                <span className="font-medium">{row.allowed ? "ALLOW" : "BLOCK"}</span> {row.cardName}
                {row.loc ? ` · ${row.loc}` : ""}
                {row.chainLink != null ? ` · CL${row.chainLink}` : ""}
                {row.respondingTo ? ` → ${row.respondingTo}` : ""}
                <div className="text-white/45">{row.reason}</div>
              </li>
            ))}
            {!debugTraces.length && <li className="text-white/40">No attempts yet this session.</li>}
          </ul>
          <div className="mt-2 font-semibold text-sky-200/80">Live scan</div>
          <ul className="mt-1 space-y-1">
            {debugScan.map((row) => (
              <li key={`${row.instanceId}-${row.zoneLabel}`} className={row.legal ? "text-emerald-200/90" : "text-white/45"}>
                <span className="font-medium">{row.legal ? "OK" : "NO"}</span> {row.cardName} · {row.zoneLabel}
                <div className="text-white/40">{row.legalityReason}</div>
              </li>
            ))}
            {!debugScan.length && <li className="text-white/40">No scanned activations.</li>}
          </ul>
        </div>
      )}

      {menu && (
        <CardActionMenu
          x={menu.x}
          y={menu.y}
          zoneCard={menu.card}
          data={byId.get(menu.card.cardId)}
          where={menu.where}
          effectOptions={menuFx}
          canNormalSummon={canNormalSummonOrSet(state, menu.owner)}
          normalSummonHint={
            canNormalSummonOrSet(state, menu.owner)
              ? remainingNormalSummons(state, menu.owner) > 1
                ? `${remainingNormalSummons(state, menu.owner)} Normal Summons left this turn`
                : undefined
              : "Already used your Normal Summon/Set this turn."
          }
          canAttack={canDeclareAttack(state, menu.owner, menu.card)}
          canAttackDirect={!state.players[menu.owner === "p1" ? "p2" : "p1"].monsters.some(Boolean)}
          handSSLabel={(() => {
            const data = byId.get(menu.card.cardId);
            if (!data || menu.where !== "hand") return undefined;
            const spec = parseHandSpecialSummon(data);
            if (!spec) return undefined;
            const mine = state.players[menu.owner].monsters.filter(Boolean).length;
            const theirs = state.players[menu.owner === "p1" ? "p2" : "p1"].monsters.filter(Boolean).length;
            const payOk = !spec.cost || canPayAllCosts(state, menu.owner, [spec.cost], menu.card.instanceId, byId);
            return handSSLegal(spec, mine, theirs, payOk) ? spec.label : undefined;
          })()}
          onClose={() => setMenu(null)}
          onAction={(a, opt) => runAction(a, menu.card, menu.owner, menu.where, opt)}
        />
      )}

      {pile && (
        <PileModal
          title={
            pile.zone === "extra"
              ? `${state.players[pile.owner].name} Extra Deck`
              : `${state.players[pile.owner].name} ${pile.zone}`
          }
          cards={openPile}
          byId={byId}
          owner={pile.owner}
          zone={pile.zone}
          onClose={() => setPile(null)}
          onPick={(card) => {
            if (pile.zone === "extra") {
              openMenu(card, "extra", pile.owner);
              return;
            }
            viewCard(card);
          }}
          onToHand={(index) =>
            dispatch({
              type: "MOVE",
              from: { owner: pile.owner, zone: pile.zone, index },
              to: { owner: pile.owner, zone: "hand" },
              faceUp: true,
            })
          }
          onToField={(index, mode = "summon-atk") => {
            const card = openPile[index];
            if (!card) return;
            if (pile.zone === "extra") {
              const data = byId.get(card.cardId);
              if (!data) return;
              runAction(mode === "summon-def" ? "summon-def" : "summon-atk", card, pile.owner, "extra");
              return;
            }
            act(
              {
                type: "PLAY",
                from: { owner: pile.owner, zone: pile.zone, index },
                player: pile.owner,
                mode,
                special: pile.zone !== "hand",
              },
              {
                type: "summon",
                player: pile.owner,
                controller: pile.owner,
                cardId: card.cardId,
                instanceId: card.instanceId,
                summonKind: pile.zone === "hand" ? "normal" : "special",
              },
            );
          }}
          onToGy={(index) =>
            act(
              {
                type: "MOVE",
                from: { owner: pile.owner, zone: pile.zone, index },
                to: { owner: pile.owner, zone: "gy" },
                faceUp: true,
              },
              { type: "sent-gy", player: pile.owner },
            )
          }
          onTop={(index) =>
            dispatch({
              type: "MOVE",
              from: { owner: pile.owner, zone: pile.zone, index },
              to: { owner: pile.owner, zone: "deck", index: 0 },
              faceUp: false,
            })
          }
          onBottom={(index) =>
            dispatch({
              type: "MOVE",
              from: { owner: pile.owner, zone: pile.zone, index },
              to: { owner: pile.owner, zone: "deck", index: 999 },
              faceUp: false,
            })
          }
          onShuffle={() => dispatch({ type: "SHUFFLE", player: pile.owner, zone: pile.zone })}
        />
      )}
    </div>
  );
}

function LpBlock({
  player,
  active,
  delta,
  onDelta,
  onChangeDelta,
}: {
  player: GameState["players"][PlayerId];
  active?: boolean;
  delta: number;
  onDelta: (n: number) => void;
  onChangeDelta?: (n: number) => void;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1.5", active && "ring-1 ring-amber-300/70")}>
      <div>
        <div className="text-[11px] text-white/50">{player.name}</div>
        <div className="font-mono text-xl font-semibold tabular-nums text-amber-200">{player.lp}</div>
      </div>
      <div className="flex gap-1">
        <button className="rounded bg-white/10 px-2 py-1 text-xs" onClick={() => onDelta(-delta)}>
          −
        </button>
        <button className="rounded bg-white/10 px-2 py-1 text-xs" onClick={() => onDelta(delta)}>
          +
        </button>
      </div>
      {onChangeDelta && (
        <input
          type="number"
          value={delta}
          onChange={(e) => onChangeDelta(Number(e.target.value) || 0)}
          className="w-14 rounded border border-white/10 bg-black/40 px-1 py-0.5 text-xs"
        />
      )}
    </div>
  );
}

function collectCards(state: GameState): ZoneCard[] {
  return [
    ...state.players.p1.hand,
    ...state.players.p1.deck,
    ...state.players.p1.gy,
    ...state.players.p1.banish,
    ...state.players.p1.extra,
    ...state.players.p1.monsters,
    ...state.players.p1.spells,
    state.players.p1.field,
    ...state.players.p2.hand,
    ...state.players.p2.deck,
    ...state.players.p2.gy,
    ...state.players.p2.banish,
    ...state.players.p2.extra,
    ...state.players.p2.monsters,
    ...state.players.p2.spells,
    state.players.p2.field,
    ...state.emz,
  ].filter(Boolean) as ZoneCard[];
}
