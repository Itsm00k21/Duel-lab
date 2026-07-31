import type { CompactCard } from "./types";
import type { DeckList } from "@/lib/deck/types";

/** Map any printing / alt-art passcode to the primary card id. */
export function buildPasscodeMap(cards: CompactCard[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const card of cards) {
    map.set(card.id, card.id);
    for (const alt of card.altImageIds ?? []) map.set(alt, card.id);
  }
  return map;
}

export function primaryPasscode(id: number, passcodes: Map<number, number>) {
  return passcodes.get(id) ?? id;
}

export function remapIds(ids: number[], passcodes: Map<number, number>) {
  return ids.map((id) => primaryPasscode(id, passcodes));
}

export function remapDeck(deck: DeckList, passcodes: Map<number, number>): DeckList {
  if (!passcodes.size) return deck;
  return {
    ...deck,
    main: remapIds(deck.main, passcodes),
    extra: remapIds(deck.extra, passcodes),
    side: remapIds(deck.side, passcodes),
  };
}

export function indexByAnyPasscode(cards: CompactCard[]): Map<number, CompactCard> {
  const map = new Map<number, CompactCard>();
  for (const card of cards) {
    map.set(card.id, card);
    for (const alt of card.altImageIds ?? []) {
      if (!map.has(alt)) map.set(alt, card);
    }
  }
  return map;
}
