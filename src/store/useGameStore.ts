"use client";

import { create } from "zustand";
import { deleteSession, getSession, listSessions, saveSession } from "@/lib/db/dexie";
import { createGame, normalizeGame, reduce } from "@/lib/game/engine";
import type { GameAction, GameState, StartDuelInput } from "@/lib/game/types";

type GameStore = {
  current: GameState | null;
  past: GameState[];
  sessions: GameState[];
  start: (input: StartDuelInput) => Promise<GameState>;
  dispatch: (action: GameAction) => void;
  undo: () => void;
  hydrate: (state: GameState) => void;
  persist: () => Promise<void>;
  loadSessions: () => Promise<void>;
  resume: (id: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  clearCurrent: () => void;
};

export const useGameStore = create<GameStore>((set, get) => ({
  current: null,
  past: [],
  sessions: [],

  start: async (input) => {
    const state = createGame(input);
    set({ current: state, past: [] });
    await saveSession(state);
    return state;
  },

  dispatch: (action) => {
    const current = get().current;
    if (!current) return;
    const next = reduce(current, action);
    set({ current: next, past: [...get().past.slice(-40), current] });
  },

  undo: () => {
    const past = get().past;
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ current: prev, past: past.slice(0, -1) });
  },

  hydrate: (state) => set({ current: normalizeGame(state), past: [] }),

  persist: async () => {
    const current = get().current;
    if (current) await saveSession(current);
  },

  loadSessions: async () => {
    set({ sessions: await listSessions() });
  },

  resume: async (id) => {
    const session = await getSession(id);
    if (session) set({ current: normalizeGame(session), past: [] });
  },

  removeSession: async (id) => {
    await deleteSession(id);
    set({ sessions: get().sessions.filter((s) => s.id !== id) });
  },

  clearCurrent: () => set({ current: null, past: [] }),
}));
