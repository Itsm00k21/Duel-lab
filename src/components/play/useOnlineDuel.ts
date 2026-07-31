"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GameAction, GameState, PlayerId } from "@/lib/game/types";
import type { RoomPublic } from "@/lib/multiplayer/roomStore";

const KEY = "duel-lab-room";

export type RoomSession = { code: string; token: string; seat: PlayerId };

export function saveRoomSession(session: RoomSession) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function loadRoomSession(): RoomSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RoomSession) : null;
  } catch {
    return null;
  }
}

export function clearRoomSession() {
  sessionStorage.removeItem(KEY);
}

type Snapshot = {
  public?: RoomPublic;
  state?: GameState | null;
  version?: number;
  error?: string;
};

export function useOnlineDuel() {
  const search = useSearchParams();
  const roomQ = search.get("room");
  const [session, setSession] = useState<RoomSession | null>(() => {
    const stored = loadRoomSession();
    const code = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("room") : null;
    if (code && stored && stored.code === code.toUpperCase()) return stored;
    return null;
  });
  const [state, setState] = useState<GameState | null>(null);
  const [pub, setPub] = useState<RoomPublic | null>(null);
  const versionRef = useRef(0);
  const queueRef = useRef(Promise.resolve());

  useEffect(() => {
    const stored = loadRoomSession();
    if (roomQ && stored && stored.code === roomQ.toUpperCase()) setSession(stored);
    else setSession(null);
  }, [roomQ]);

  const applySnapshot = useCallback(
    (json: Snapshot, session: RoomSession) => {
      const version = typeof json.version === "number" ? json.version : versionRef.current;
      if (version < versionRef.current) return;
      versionRef.current = version;
      if (json.public) setPub(json.public);
      if (json.state) {
        setState({ ...json.state, pvp: { roomCode: session.code, seat: session.seat }, view: session.seat });
      }
    },
    [],
  );

  useEffect(() => {
    if (!session) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/rooms/${session.code}`, { headers: { "x-room-token": session.token } });
        if (!res.ok || stop) return;
        const json = (await res.json()) as Snapshot;
        if (stop) return;
        applySnapshot(json, session);
      } catch {
        /* ignore poll errors */
      }
    };
    void tick();
    const id = window.setInterval(tick, 700);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [applySnapshot, session]);

  const dispatch = useCallback(
    (action: GameAction) => {
      if (!session) return;
      queueRef.current = queueRef.current
        .catch(() => undefined)
        .then(async () => {
          const res = await fetch(`/api/rooms/${session.code}/action`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-room-token": session.token },
            body: JSON.stringify({ action }),
          });
          const json = (await res.json()) as Snapshot;
          if (json.error) return;
          applySnapshot(json, session);
        });
    },
    [applySnapshot, session],
  );

  return {
    active: Boolean(session && roomQ),
    seat: session?.seat ?? null,
    code: session?.code ?? null,
    state,
    public: pub,
    dispatch,
    session,
  };
}
