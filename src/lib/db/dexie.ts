import Dexie, { type EntityTable } from "dexie";
import type { CompactCard, SyncMeta } from "@/lib/cards/types";
import type { DeckList } from "@/lib/deck/types";
import type { GameState } from "@/lib/game/types";

type MetaRow = { key: string; value: unknown };

class DuelLabDB extends Dexie {
  cards!: EntityTable<CompactCard, "id">;
  decks!: EntityTable<DeckList, "id">;
  sessions!: EntityTable<GameState, "id">;
  meta!: EntityTable<MetaRow, "key">;

  constructor() {
    super("duel-lab");
    this.version(1).stores({
      cards: "id, name, type, frameType, race, attribute, level, archetype, tcgDate",
      decks: "id, name, formatId, updatedAt",
      sessions: "id, updatedAt, formatId",
      meta: "key",
    });
  }
}

export const db = new DuelLabDB();

export async function getSyncMeta(): Promise<SyncMeta | null> {
  const row = await db.meta.get("sync");
  return (row?.value as SyncMeta | undefined) ?? null;
}

export async function setSyncMeta(value: SyncMeta) {
  await db.meta.put({ key: "sync", value });
}

export async function replaceAllCards(cards: CompactCard[], meta: SyncMeta) {
  await db.transaction("rw", db.cards, db.meta, async () => {
    await db.cards.clear();
    await db.cards.bulkPut(cards);
    await setSyncMeta(meta);
  });
}

export async function loadAllCards(): Promise<CompactCard[]> {
  return db.cards.toArray();
}

export async function upsertDeck(deck: DeckList) {
  await db.decks.put(deck);
}

export async function deleteDeck(id: string) {
  await db.decks.delete(id);
}

export async function listDecks(): Promise<DeckList[]> {
  return db.decks.orderBy("updatedAt").reverse().toArray();
}

export async function getDeck(id: string): Promise<DeckList | undefined> {
  return db.decks.get(id);
}

export async function saveSession(state: GameState) {
  await db.sessions.put(state);
}

export async function listSessions(): Promise<GameState[]> {
  return db.sessions.orderBy("updatedAt").reverse().toArray();
}

export async function getSession(id: string): Promise<GameState | undefined> {
  return db.sessions.get(id);
}

export async function deleteSession(id: string) {
  await db.sessions.delete(id);
}
