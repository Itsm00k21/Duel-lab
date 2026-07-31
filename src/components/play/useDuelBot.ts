"use client";

import { useEffect, useRef, useState } from "react";
import type { CompactCard } from "@/lib/cards/types";
import { decideBot } from "@/lib/bot/decide";
import { botProfileFor } from "@/lib/bot/profiles";
import type { GameAction, GameState } from "@/lib/game/types";
import type { DuelEvent, TriggerPrompt } from "@/lib/rules/triggers";
import { peekCard } from "@/lib/game/engine";
import { useGameStore } from "@/store/useGameStore";

export function useDuelBot({
  state,
  byId,
  prompt,
  onAct,
  onPromptYes,
  onPromptNo,
}: {
  state: GameState | null;
  byId: Map<number, CompactCard>;
  prompt: TriggerPrompt | null;
  onAct: (action: GameAction, event?: DuelEvent) => void;
  onPromptYes: () => void;
  onPromptNo: () => void;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const onActRef = useRef(onAct);
  const yesRef = useRef(onPromptYes);
  const noRef = useRef(onPromptNo);
  const byIdRef = useRef(byId);
  const promptRef = useRef(prompt);
  onActRef.current = onAct;
  yesRef.current = onPromptYes;
  noRef.current = onPromptNo;
  byIdRef.current = byId;
  promptRef.current = prompt;

  const usedRef = useRef(new Set<string>());
  const turnKeyRef = useRef("");
  const timerRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  const sig = state
    ? [
        state.id,
        state.turn,
        state.phase,
        state.activePlayer,
        state.pve?.bot,
        state.chain.links.length,
        state.chain.pendingPlayer,
        state.chain.complete ? 1 : 0,
        prompt?.id ?? "",
        byId.size,
        state.players.p1.hand.length,
        state.players.p2.hand.length,
        state.players.p1.monsters.filter(Boolean).length,
        state.players.p2.monsters.filter(Boolean).length,
        state.players.p1.spells.filter(Boolean).length,
        state.players.p2.spells.filter(Boolean).length,
        state.players.p1.lp,
        state.players.p2.lp,
        state.drewThisTurn?.p1 ? 1 : 0,
        state.drewThisTurn?.p2 ? 1 : 0,
        state.attackedThisTurn?.length ?? 0,
        state.fetBox,
        state.players.p1.gy.length,
        state.players.p2.gy.length,
        [...state.players.p1.monsters, ...state.players.p2.monsters, state.players.p1.field, state.players.p2.field]
          .filter(Boolean)
          .map((c) => `${c!.instanceId}:${c!.faceUp ? 1 : 0}:${c!.position}`)
          .join(","),
      ].join("|")
    : "";

  useEffect(() => {
    if (!state?.pve) {
      setStatus(null);
      return;
    }
    if (byId.size < 1) {
      setStatus("Loading cards…");
      return;
    }

    const turnKey = `${state.turn}:${state.activePlayer}`;
    if (turnKeyRef.current !== turnKey) {
      turnKeyRef.current = turnKey;
      usedRef.current = new Set();
    }

    if (busyRef.current || timerRef.current != null) return; // follow-up via tick after act

    const intent = decideBot(state, byId, { prompt, usedEffectKeys: usedRef.current });
    if (!intent || intent.type === "wait") {
      if (state.activePlayer !== state.pve.bot && !prompt && !state.chain.links.length) setStatus(null);
      else if (intent?.type === "wait") setStatus(intent.note);
      return;
    }

    const profile = botProfileFor(state.pve.premadeId);
    setStatus(intent.note || `${profile.name} is thinking…`);
    const delay =
      intent.type === "dispatch" && (intent.action.type === "NEXT_PHASE" || intent.action.type === "NEXT_TURN") ? 320 : 520;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const live = useGameStore.getState().current;
      if (!live?.pve) return;
      const fresh = decideBot(live, byIdRef.current, { prompt: promptRef.current, usedEffectKeys: usedRef.current });
      if (!fresh || fresh.type === "wait") {
        if (fresh?.type === "wait") setStatus(fresh.note);
        return;
      }
      busyRef.current = true;
      try {
        if (fresh.type === "prompt-yes") yesRef.current();
        else if (fresh.type === "prompt-no") noRef.current();
        else if (fresh.type === "dispatch") {
          if (fresh.effectKey) usedRef.current.add(fresh.effectKey);
          const action = fresh.action;
          const before = useGameStore.getState().current;
          const piece = action.type === "PLAY" && before ? peekCard(before, action.from) : null;
          const event: DuelEvent | undefined =
            action.type === "PLAY" && (action.mode === "summon-atk" || action.mode === "summon-def" || action.mode === "set-monster")
              ? {
                  type: "summon",
                  player: action.player,
                  controller: action.player,
                  cardId: piece?.cardId,
                  instanceId: piece?.instanceId,
                  summonKind: action.special || action.from.zone !== "hand" ? "special" : "normal",
                }
              : action.type === "PLAY" && (action.mode === "activate-st" || action.mode === "to-field")
                ? {
                    type: "activation",
                    player: action.player,
                    controller: action.player,
                    cardId: piece?.cardId,
                    instanceId: piece?.instanceId,
                  }
                : undefined;
          onActRef.current(action, event);
        }
      } finally {
        window.setTimeout(() => {
          busyRef.current = false;
          setTick((n) => n + 1);
        }, 60);
      }
    }, delay);

    return undefined;
  }, [sig, prompt, state, byId, tick]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      busyRef.current = false;
    },
    [],
  );

  if (!state?.pve) return { status: null as string | null, profile: null };
  return { status, profile: botProfileFor(state.pve.premadeId) };
}
