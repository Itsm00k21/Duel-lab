import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { createGame, reduce } from "@/lib/game/engine";
import type { FormatId } from "@/lib/deck/formats";
import type { DeckList } from "@/lib/deck/types";
import type { GameAction, GameState, PlayerId } from "@/lib/game/types";
import { sanitizeState } from "./sanitize";

export type RoomStatus = "lobby" | "coin" | "choose" | "duel";

export type RoomPublic = {
  code: string;
  formatId: FormatId;
  status: RoomStatus;
  hostName: string;
  guestName?: string;
  coin?: { value: "Heads" | "Tails"; winnerSeat: PlayerId };
  winnerSeat?: PlayerId;
  version: number;
};

type Seat = {
  token: string;
  name: string;
  deck: DeckList;
};

type Room = {
  code: string;
  formatId: FormatId;
  host: Seat;
  guest?: Seat;
  status: RoomStatus;
  coin?: { value: "Heads" | "Tails"; winnerSeat: PlayerId };
  choice?: "first" | "second";
  state?: GameState;
  version: number;
  createdAt: number;
};

const rooms = new Map<string, Room>();
const STORE_PATH = process.env.ROOM_STORE_PATH || path.join(process.cwd(), "data", "rooms.json");
let hydrated = false;

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    if (!existsSync(STORE_PATH)) return;
    const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8")) as { rooms?: Room[] };
    for (const room of parsed.rooms ?? []) {
      if (room?.code) rooms.set(room.code.toUpperCase(), room);
    }
  } catch {
    /* first boot or corrupt store — start empty */
  }
}

function persist() {
  try {
    mkdirSync(path.dirname(STORE_PATH), { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify({ rooms: [...rooms.values()] }));
  } catch {
    /* disk may be read-only on some hosts */
  }
}

function gc() {
  hydrate();
  const cutoff = Date.now() - 1000 * 60 * 60 * 6;
  let changed = false;
  for (const [code, room] of rooms) {
    if (room.createdAt < cutoff) {
      rooms.delete(code);
      changed = true;
    }
  }
  if (changed) persist();
}

function code6() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function createRoom(input: { name: string; formatId: FormatId; deck: DeckList }) {
  gc();
  let code = code6();
  while (rooms.has(code)) code = code6();
  const room: Room = {
    code,
    formatId: input.formatId,
    host: { token: nanoid(16), name: input.name || "Host", deck: input.deck },
    status: "lobby",
    version: 1,
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  persist();
  return { code, token: room.host.token, seat: "p1" as PlayerId, public: publicRoom(room) };
}

export function peekRoom(code: string): RoomPublic {
  return publicRoom(must(code));
}

export function setRoomFormat(code: string, token: string, formatId: FormatId) {
  const room = must(code);
  if (seatOf(room, token) !== "p1") throw new Error("Only the host can change format.");
  if (room.status !== "lobby") throw new Error("Format is locked after a guest joins.");
  room.formatId = formatId;
  room.version += 1;
  persist();
  return publicRoom(room);
}

export function joinRoom(code: string, input: { name: string; deck: DeckList }) {
  hydrate();
  const room = rooms.get(code.toUpperCase());
  if (!room) throw new Error("Room not found.");
  if (room.guest) throw new Error("Room is full.");
  if (room.status !== "lobby") throw new Error("Duel already started.");
  room.guest = { token: nanoid(16), name: input.name || "Guest", deck: input.deck };
  room.status = "coin";
  room.version += 1;
  persist();
  return { code: room.code, token: room.guest.token, seat: "p2" as PlayerId, public: publicRoom(room) };
}

function seatOf(room: Room, token: string): PlayerId | null {
  if (room.host.token === token) return "p1";
  if (room.guest?.token === token) return "p2";
  return null;
}

export function flipCoin(code: string, token: string) {
  const room = must(code);
  if (seatOf(room, token) !== "p1") throw new Error("Only the host can flip.");
  if (room.status !== "coin" && room.status !== "lobby") throw new Error("Coin already flipped.");
  if (!room.guest) throw new Error("Wait for your opponent.");
  const value: "Heads" | "Tails" = Math.random() < 0.5 ? "Heads" : "Tails";
  // Heads → host (p1) wins the toss; Tails → guest.
  const winnerSeat: PlayerId = value === "Heads" ? "p1" : "p2";
  room.coin = { value, winnerSeat };
  room.status = "choose";
  room.version += 1;
  persist();
  return publicRoom(room);
}

export function chooseFirst(code: string, token: string, choice: "first" | "second") {
  const room = must(code);
  const seat = seatOf(room, token);
  if (!seat) throw new Error("Invalid seat.");
  if (room.status !== "choose" || !room.coin) throw new Error("Not in choose step.");
  if (seat !== room.coin.winnerSeat) throw new Error("Only the coin winner chooses.");
  if (!room.guest) throw new Error("Missing opponent.");
  room.choice = choice;
  const startingPlayer: PlayerId =
    choice === "first" ? room.coin.winnerSeat : room.coin.winnerSeat === "p1" ? "p2" : "p1";
  room.state = createGame({
    formatId: room.formatId,
    startingPlayer,
    p1: { name: room.host.name, deck: room.host.deck },
    p2: { name: room.guest.name, deck: room.guest.deck },
    pvp: { roomCode: room.code },
  });
  // stamp names
  for (const pid of ["p1", "p2"] as const) {
    const p = room.state.players[pid];
    for (const zone of ["deck", "hand", "extra", "side", "gy", "banish"] as const) {
      for (const card of p[zone]) {
        if (!card.name) card.name = undefined;
      }
    }
  }
  room.status = "duel";
  room.version += 1;
  persist();
  return publicRoom(room);
}

export function applyAction(code: string, token: string, action: GameAction) {
  const room = must(code);
  const seat = seatOf(room, token);
  if (!seat) throw new Error("Invalid seat.");
  if (room.status !== "duel" || !room.state) throw new Error("Duel not running.");
  if (action.type === "VIEW") {
    // ignore god-view attempts from clients
    return snapshot(room, seat);
  }
  room.state = reduce(room.state, action);
  room.version += 1;
  persist();
  return snapshot(room, seat);
}

export function getSnapshot(code: string, token: string) {
  const room = must(code);
  const seat = seatOf(room, token);
  if (!seat) throw new Error("Invalid seat.");
  return snapshot(room, seat);
}

export function publicRoom(room: Room): RoomPublic {
  return {
    code: room.code,
    formatId: room.formatId,
    status: room.status,
    hostName: room.host.name,
    guestName: room.guest?.name,
    coin: room.coin,
    winnerSeat: room.coin?.winnerSeat,
    version: room.version,
  };
}

function snapshot(room: Room, seat: PlayerId) {
  return {
    public: publicRoom(room),
    seat,
    state: room.state ? sanitizeState(room.state, seat) : null,
    version: room.version,
  };
}

function must(code: string) {
  hydrate();
  const room = rooms.get(code.toUpperCase());
  if (!room) throw new Error("Room not found.");
  return room;
}
