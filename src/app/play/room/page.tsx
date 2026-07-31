"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { saveRoomSession } from "@/components/play/useOnlineDuel";
import { premadesForFormat } from "@/lib/bot/randomOpponent";
import { buildPasscodeMap, remapDeck } from "@/lib/cards/passcodes";
import { FORMATS, type FormatId } from "@/lib/deck/formats";
import { materializePremade } from "@/lib/deck/premade";
import type { DeckList } from "@/lib/deck/types";
import type { RoomPublic } from "@/lib/multiplayer/roomStore";
import { useCardStore } from "@/store/useCardStore";
import { useDeckStore } from "@/store/useDeckStore";

export default function RoomHubPage() {
  const router = useRouter();
  const decks = useDeckStore((s) => s.decks);
  const create = useDeckStore((s) => s.create);
  const cards = useCardStore((s) => s.cards);
  const [name, setName] = useState("Duelist");
  const [formatId, setFormatId] = useState<FormatId>("advanced");
  const [source, setSource] = useState<"mine" | "premade">("mine");
  const [deckId, setDeckId] = useState("");
  const [premadeId, setPremadeId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [peek, setPeek] = useState<RoomPublic | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const joinFormat = peek?.formatId ?? formatId;
  const premades = useMemo(() => premadesForFormat(joinFormat), [joinFormat]);
  const myDecks = decks;

  async function resolveDeck(): Promise<DeckList> {
    const passcodes = buildPasscodeMap(cards);
    if (source === "mine") {
      const deck = decks.find((d) => d.id === deckId);
      if (!deck) throw new Error("Pick one of your saved decks.");
      return remapDeck(deck, passcodes);
    }
    const premade = premades.find((d) => d.id === premadeId);
    if (!premade) throw new Error("Pick a premade deck for this format.");
    const { deck, missing } = materializePremade(premade, cards);
    if (missing.length) setErr(`Premade missing ${missing.length} names.`);
    return {
      ...deck,
      id: `room-${premade.id}-${Date.now()}`,
      formatId: joinFormat === "master-duel" ? "master-duel" : "advanced",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async function savePremadeLocally() {
    setSavedMsg(null);
    setErr(null);
    try {
      const premade = premades.find((d) => d.id === premadeId);
      if (!premade) throw new Error("Pick a premade first.");
      const { deck, missing } = materializePremade(premade, cards);
      const saved = await create({
        ...deck,
        name: `${premade.name} (${premade.format === "tcg" ? "TCG" : "MD"})`,
        formatId: premade.format === "master-duel" ? "master-duel" : "advanced",
      });
      setSource("mine");
      setDeckId(saved.id);
      setSavedMsg(`Saved “${saved.name}” to your decks${missing.length ? ` (${missing.length} missing names)` : ""}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function createRoom() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, formatId, deck: await resolveDeck() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Create failed");
      saveRoomSession({ code: json.code, token: json.token, seat: json.seat });
      router.push(`/play/room/${json.code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function lookup() {
    setErr(null);
    setPeek(null);
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) return;
    const res = await fetch(`/api/rooms/${code}/peek`);
    const json = await res.json();
    if (!res.ok) {
      setErr(json.error || "Room not found");
      return;
    }
    setPeek(json);
    setFormatId(json.formatId);
  }

  async function join() {
    setBusy(true);
    setErr(null);
    try {
      const code = joinCode.trim().toUpperCase();
      const res = await fetch(`/api/rooms/${code}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, deck: await resolveDeck() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Join failed");
      saveRoomSession({ code: json.code, token: json.token, seat: json.seat });
      router.push(`/play/room/${json.code}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const canUseDeck = source === "mine" ? Boolean(deckId) : Boolean(premadeId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/play" className="text-sm text-muted hover:text-text">
          ← Play
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Duel room</h1>
        <p className="text-sm text-muted">
          Host picks TCG or Master Duel. Both players bring a saved deck or a format premade. Each device keeps its own deck list. Testing only — same shared link for both of you, then tear it down.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4">
        <h2 className="font-semibold">You</h2>
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Display name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2" />
        </label>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <button type="button" className={`rounded-xl py-2 ${source === "mine" ? "bg-amber-300 font-semibold text-zinc-950" : "bg-bg"}`} onClick={() => setSource("mine")}>
            My decks
          </button>
          <button type="button" className={`rounded-xl py-2 ${source === "premade" ? "bg-amber-300 font-semibold text-zinc-950" : "bg-bg"}`} onClick={() => setSource("premade")}>
            Premades
          </button>
        </div>
        {source === "mine" ? (
          <label className="block space-y-1 text-sm">
            <span className="text-muted">Saved on this device</span>
            <select value={deckId} onChange={(e) => setDeckId(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2">
              <option value="">Select…</option>
              {myDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {FORMATS[d.formatId]?.name ?? d.formatId}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted">Friends save decks on their own phone/browser — they won’t see yours.</p>
          </label>
        ) : (
          <div className="space-y-2 text-sm">
            <label className="block space-y-1">
              <span className="text-muted">
                {joinFormat === "master-duel" ? "Master Duel" : "TCG"} premade snapshots
              </span>
              <select value={premadeId} onChange={(e) => setPremadeId(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2">
                <option value="">Select…</option>
                {premades.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={!premadeId} onClick={() => void savePremadeLocally()} className="rounded-xl border border-line px-3 py-2 disabled:opacity-40">
              Save this premade to my decks
            </button>
          </div>
        )}
        {savedMsg && <p className="text-xs text-ok">{savedMsg}</p>}
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4">
        <h2 className="font-semibold">Create room (host)</h2>
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Format</span>
          <select value={formatId} onChange={(e) => setFormatId(e.target.value as FormatId)} className="w-full rounded-lg border border-line bg-bg px-3 py-2">
            <option value="advanced">TCG Advanced</option>
            <option value="master-duel">Master Duel sandbox</option>
            <option value="no-ban">No Banlist (lab)</option>
          </select>
        </label>
        <button type="button" disabled={!canUseDeck || busy} onClick={() => void createRoom()} className="w-full rounded-xl bg-amber-300 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-40">
          Create room
        </button>
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-bg-elev p-4">
        <h2 className="font-semibold">Join friend</h2>
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Room code</span>
          <div className="flex gap-2">
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="ABC123" className="w-full rounded-lg border border-line bg-bg px-3 py-2 tracking-[0.3em]" />
            <button type="button" onClick={() => void lookup()} className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm">
              Lookup
            </button>
          </div>
        </label>
        {peek && (
          <p className="text-xs text-muted">
            {peek.hostName}’s room · {FORMATS[peek.formatId]?.name ?? peek.formatId} · {peek.status}
            . Premades switch to this format.
          </p>
        )}
        <button type="button" disabled={!canUseDeck || joinCode.trim().length < 4 || busy} onClick={() => void join()} className="w-full rounded-xl border border-line py-2.5 text-sm font-semibold disabled:opacity-40">
          Join room
        </button>
      </div>

      {err && <p className="text-sm text-danger">{err}</p>}
      <p className="text-xs text-muted">
        <Link href="/decks" className="text-accent">
          Open Decks
        </Link>{" "}
        to build or import a .ydk, then come back. Each player’s collection stays on their device.
      </p>
    </div>
  );
}
