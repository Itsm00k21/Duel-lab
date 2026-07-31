"use client";

import { create } from "zustand";
import { decodeCardText } from "@/lib/cards/compact";
import { applyCardLegalityFixes } from "@/lib/cards/legality";
import { indexByAnyPasscode } from "@/lib/cards/passcodes";
import type { CompactCard, SyncMeta } from "@/lib/cards/types";
import { getSyncMeta, loadAllCards, replaceAllCards } from "@/lib/db/dexie";
import { buildSynergyIndex, type SynergyIndex } from "@/lib/synergy";

type CardState = {
  ready: boolean;
  syncing: boolean;
  error: string | null;
  cards: CompactCard[];
  byId: Map<number, CompactCard>;
  byName: Map<string, CompactCard>;
  meta: SyncMeta | null;
  synergy: SynergyIndex | null;
  loadLocal: () => Promise<void>;
  syncRemote: (force?: boolean) => Promise<void>;
};

function cleanCard(card: CompactCard): CompactCard {
  return applyCardLegalityFixes({
    ...card,
    name: decodeCardText(card.name),
    desc: decodeCardText(card.desc),
    treatedAs: card.treatedAs ? decodeCardText(card.treatedAs) : card.treatedAs,
  });
}

function indexCards(raw: CompactCard[]) {
  const cards = raw.map(cleanCard);
  return {
    cards,
    byId: indexByAnyPasscode(cards),
    byName: new Map(cards.map((c) => [c.name.toLowerCase(), c])),
    synergy: buildSynergyIndex(cards),
  };
}

export const useCardStore = create<CardState>((set, get) => ({
  ready: false,
  syncing: false,
  error: null,
  cards: [],
  byId: new Map(),
  byName: new Map(),
  meta: null,
  synergy: null,

  loadLocal: async () => {
    const [cards, meta] = await Promise.all([loadAllCards(), getSyncMeta()]);
    set({
      ...indexCards(cards),
      meta,
      ready: true,
    });
    const needsArt = cards.length === 0 || cards.some((c) => typeof c.imageId !== "number");
    if (needsArt) {
      await get().syncRemote(cards.length > 0);
    }
  },

  syncRemote: async (force = false) => {
    set({ syncing: true, error: null });
    try {
      const res = await fetch(`/api/cards/sync${force ? "?force=1" : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      const cards = json.cards as CompactCard[];
      const meta: SyncMeta = {
        version: json.meta.version,
        lastUpdate: json.meta.lastUpdate,
        syncedAt: new Date().toISOString(),
        count: json.meta.count,
        imageExact: json.meta.imageExact,
        imageAlt: json.meta.imageAlt,
        imageFallback: json.meta.imageFallback,
      };
      await replaceAllCards(cards, meta);
      set({
        ...indexCards(cards),
        meta,
        syncing: false,
        ready: true,
      });
    } catch (error) {
      set({
        syncing: false,
        ready: true,
        error: error instanceof Error ? error.message : "Sync failed",
      });
    }
  },
}));
