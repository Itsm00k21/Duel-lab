"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { deleteDeck, getDeck, listDecks, upsertDeck } from "@/lib/db/dexie";
import type { FormatId } from "@/lib/deck/formats";
import type { DeckList } from "@/lib/deck/types";

type DeckState = {
  ready: boolean;
  decks: DeckList[];
  load: () => Promise<void>;
  create: (partial?: Partial<DeckList>) => Promise<DeckList>;
  save: (deck: DeckList) => Promise<void>;
  remove: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<DeckList | null>;
  get: (id: string) => Promise<DeckList | undefined>;
};

function stamp(partial: Partial<DeckList> = {}): DeckList {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? nanoid(),
    name: partial.name ?? "New Deck",
    formatId: (partial.formatId as FormatId) ?? "advanced",
    notes: partial.notes ?? "",
    main: partial.main ?? [],
    extra: partial.extra ?? [],
    side: partial.side ?? [],
    createdAt: partial.createdAt ?? now,
    updatedAt: now,
  };
}

export const useDeckStore = create<DeckState>((set, get) => ({
  ready: false,
  decks: [],

  load: async () => {
    const decks = await listDecks();
    set({ decks, ready: true });
  },

  create: async (partial) => {
    const deck = stamp(partial);
    await upsertDeck(deck);
    set({ decks: [deck, ...get().decks.filter((d) => d.id !== deck.id)] });
    return deck;
  },

  save: async (deck) => {
    const next = { ...deck, updatedAt: new Date().toISOString() };
    await upsertDeck(next);
    set({
      decks: [next, ...get().decks.filter((d) => d.id !== next.id)].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    });
  },

  remove: async (id) => {
    await deleteDeck(id);
    set({ decks: get().decks.filter((d) => d.id !== id) });
  },

  duplicate: async (id) => {
    const src = get().decks.find((d) => d.id === id) ?? (await getDeck(id));
    if (!src) return null;
    return get().create({
      ...src,
      id: nanoid(),
      name: `${src.name} copy`,
      createdAt: undefined,
      updatedAt: undefined,
    });
  },

  get: async (id) => {
    return get().decks.find((d) => d.id === id) ?? getDeck(id);
  },
}));
