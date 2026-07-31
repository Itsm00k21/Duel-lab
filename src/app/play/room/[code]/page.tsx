"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loadRoomSession, saveRoomSession } from "@/components/play/useOnlineDuel";
import { FORMATS, type FormatId } from "@/lib/deck/formats";
import type { RoomPublic } from "@/lib/multiplayer/roomStore";

export default function RoomLobbyPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = String(params.code || "").toUpperCase();
  const [pub, setPub] = useState<RoomPublic | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<ReturnType<typeof loadRoomSession>>(null);
  const seat = session?.code === code ? session.seat : null;

  useEffect(() => {
    setSession(loadRoomSession());
  }, [code]);

  useEffect(() => {
    if (!session || session.code !== code) return;
    let stop = false;
    const tick = async () => {
      const res = await fetch(`/api/rooms/${code}`, { headers: { "x-room-token": session.token } });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error || "Lost room");
        return;
      }
      if (stop) return;
      setPub(json.public);
      if (json.public?.status === "duel") {
        saveRoomSession(session);
        router.replace(`/play/table?room=${code}`);
      }
    };
    void tick();
    const id = window.setInterval(tick, 800);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [code, router, session?.token, session?.code]);

  async function changeFormat(next: FormatId) {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/rooms/${code}/format`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-room-token": session.token },
        body: JSON.stringify({ formatId: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Format change failed");
      setPub(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function flip() {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/rooms/${code}/coin`, { method: "POST", headers: { "x-room-token": session.token } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Flip failed");
      setPub(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function choose(choice: "first" | "second") {
    if (!session) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/rooms/${code}/choose`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-room-token": session.token },
        body: JSON.stringify({ choice }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Choose failed");
      router.replace(`/play/table?room=${code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const share =
    typeof window !== "undefined" ? `${window.location.origin}/play/room` : "/play/room";

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Link href="/play/room" className="text-sm text-muted hover:text-text">
        ← Rooms
      </Link>
      <div className="rounded-3xl border border-amber-200/20 bg-bg-elev p-6 text-center">
        <p className="text-[11px] uppercase tracking-[0.25em] text-amber-200">Duel room</p>
        <div className="mt-2 font-mono text-4xl font-semibold tracking-[0.35em]">{code}</div>
        <p className="mt-2 text-sm text-muted">Share the code. Friend opens Duel room → Join. Same live server required.</p>
        <p className="mt-1 text-xs text-muted">{share}</p>
      </div>

      <div className="rounded-2xl border border-line bg-bg-elev p-4 text-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-muted">Format</span>
          {seat === "p1" && pub?.status === "lobby" ? (
            <select
              value={pub.formatId}
              disabled={busy}
              onChange={(e) => void changeFormat(e.target.value as FormatId)}
              className="rounded-lg border border-line bg-bg px-2 py-1"
            >
              <option value="advanced">TCG Advanced</option>
              <option value="master-duel">Master Duel sandbox</option>
              <option value="no-ban">No Banlist</option>
            </select>
          ) : (
            <span className="font-medium">{pub ? FORMATS[pub.formatId]?.name ?? pub.formatId : "…"}</span>
          )}
        </div>
        <div className="flex justify-between">
          <span>Host (P1)</span>
          <span className="font-medium">{pub?.hostName ?? "…"}</span>
        </div>
        <div className="mt-2 flex justify-between">
          <span>Guest (P2)</span>
          <span className="font-medium">{pub?.guestName ?? "Waiting…"}</span>
        </div>
        <div className="mt-2 text-xs text-muted">You are {seat === "p1" ? "Host / P1" : seat === "p2" ? "Guest / P2" : "not seated in this room on this device."}</div>
      </div>

      {pub?.status === "lobby" && <p className="text-center text-sm text-muted">Waiting for opponent to join…</p>}

      {pub?.status === "coin" && seat === "p1" && (
        <button type="button" disabled={busy} onClick={() => void flip()} className="w-full rounded-2xl bg-amber-300 py-3 font-semibold text-zinc-950">
          Coin flip
        </button>
      )}
      {pub?.status === "coin" && seat === "p2" && <p className="text-center text-sm text-muted">Host is flipping the coin…</p>}

      {pub?.coin && (
        <div className="rounded-2xl border border-amber-200/25 bg-black/30 p-5 text-center">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-200">Coin</div>
          <div className="mt-1 text-3xl font-semibold">{pub.coin.value}</div>
          <p className="mt-2 text-sm text-muted">
            {pub.coin.winnerSeat === "p1" ? pub.hostName : pub.guestName} wins the toss
            {pub.status === "choose" ? " — choose first or second." : "."}
          </p>
        </div>
      )}

      {pub?.status === "choose" && seat === pub.winnerSeat && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={() => void choose("first")} className="rounded-2xl bg-amber-300 py-3 font-semibold text-zinc-950">
            Go first
          </button>
          <button type="button" disabled={busy} onClick={() => void choose("second")} className="rounded-2xl border border-line py-3 font-semibold">
            Go second
          </button>
        </div>
      )}
      {pub?.status === "choose" && seat && seat !== pub.winnerSeat && (
        <p className="text-center text-sm text-muted">Opponent is choosing first or second…</p>
      )}

      {err && <p className="text-center text-sm text-danger">{err}</p>}
    </div>
  );
}
