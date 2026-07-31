"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { PREMADE_DECKS } from "@/data/premade-decks";
import { randomPremade, premadesForFormat } from "@/lib/bot/randomOpponent";
import { botProfileFor } from "@/lib/bot/profiles";
import { buildPasscodeMap, remapDeck } from "@/lib/cards/passcodes";
import { FORMATS, FORMAT_LIST, type FormatId } from "@/lib/deck/formats";
import { materializePremade } from "@/lib/deck/premade";
import type { DeckList } from "@/lib/deck/types";
import { clearRoomSession } from "@/components/play/useOnlineDuel";
import { useCardStore } from "@/store/useCardStore";
import { useDeckStore } from "@/store/useDeckStore";
import { useGameStore } from "@/store/useGameStore";

function stampNames(state: ReturnType<typeof useGameStore.getState>["current"], byId: Map<number, { name: string }>) {
  if (!state) return;
  for (const pid of ["p1", "p2"] as const) {
    const p = state.players[pid];
    for (const zone of ["deck", "hand", "extra", "side", "gy", "banish"] as const) {
      for (const card of p[zone]) card.name = byId.get(card.cardId)?.name;
    }
  }
}

function PlaySetup() {
  const router = useRouter();
  const search = useSearchParams();
  const decks = useDeckStore((s) => s.decks);
  const sessions = useGameStore((s) => s.sessions);
  const loadSessions = useGameStore((s) => s.loadSessions);
  const start = useGameStore((s) => s.start);
  const resume = useGameStore((s) => s.resume);
  const removeSession = useGameStore((s) => s.removeSession);
  const byId = useCardStore((s) => s.byId);
  const allCards = useCardStore((s) => s.cards);
  const preselect = search.get("deck");

  const [formatId, setFormatId] = useState<FormatId>("advanced");
  const [p1Deck, setP1Deck] = useState(preselect ?? "");
  const [p2Deck, setP2Deck] = useState("");
  const [p1Name, setP1Name] = useState("Player 1");
  const [p2Name, setP2Name] = useState("Player 2");
  const [lp, setLp] = useState(8000);
  const [hand, setHand] = useState(5);
  const [vsBot, setVsBot] = useState(true);
  const [oppMode, setOppMode] = useState<"random" | string>("random");
  const [turnChoice, setTurnChoice] = useState<"first" | "second" | "coin">("first");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [coinPhase, setCoinPhase] = useState<"idle" | "flipping" | "result">("idle");
  const [coinFace, setCoinFace] = useState<"Heads" | "Tails" | null>(null);
  const [tossWinner, setTossWinner] = useState<"you" | "bot" | null>(null);
  const [botPick, setBotPick] = useState<"first" | "second">("first");

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (preselect) setP1Deck(preselect);
  }, [preselect]);

  useEffect(() => {
    setLp(FORMATS[formatId].startingLp);
  }, [formatId]);

  const premades = useMemo(() => premadesForFormat(formatId), [formatId]);
  const canStart = Boolean(p1Deck) && (vsBot || Boolean(p2Deck));

  function requestStart() {
    if (!canStart || busy) return;
    setErr(null);
    if (vsBot && turnChoice === "coin") {
      setCoinPhase("flipping");
      setCoinFace(null);
      setTossWinner(null);
      window.setTimeout(() => {
        const youWin = Math.random() < 0.5;
        const pick: "first" | "second" = Math.random() < 0.75 ? "first" : "second";
        setCoinFace(youWin ? "Heads" : "Tails");
        setTossWinner(youWin ? "you" : "bot");
        setBotPick(pick);
        setCoinPhase("result");
        if (!youWin) {
          window.setTimeout(() => void begin(pick === "first" ? "p2" : "p1"), 950);
        }
      }, 1100);
      return;
    }
    const startingPlayer: "p1" | "p2" = vsBot && turnChoice === "second" ? "p2" : "p1";
    void begin(startingPlayer);
  }

  async function begin(startingPlayer: "p1" | "p2") {
    const d1 = decks.find((d) => d.id === p1Deck);
    if (!d1) return;
    setBusy(true);
    setErr(null);
    setCoinPhase("idle");
    try {
      const passcodes = buildPasscodeMap(allCards);
      let p2List: DeckList | null = null;
      let pve: { bot: "p2"; premadeId: string; deckName: string } | undefined;
      let p2label = p2Name;

      if (vsBot) {
        const premade =
          oppMode === "random"
            ? randomPremade(formatId)
            : PREMADE_DECKS.find((d) => d.id === oppMode) ?? randomPremade(formatId);
        if (!premade) throw new Error("No premade decks for this format. Use TCG Advanced or Master Duel.");
        const { deck, missing } = materializePremade(premade, allCards);
        p2List = { ...deck, id: `bot-${premade.id}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        pve = { bot: "p2", premadeId: premade.id, deckName: premade.name };
        p2label = `Lab Bot (${premade.name})`;
        if (missing.length) setErr(`Bot list missing ${missing.length} name(s): ${missing.slice(0, 4).join(", ")}`);
      } else {
        const d2 = decks.find((d) => d.id === p2Deck);
        if (!d2) throw new Error("Pick a P2 deck.");
        p2List = d2;
      }

      clearRoomSession();
      const state = await start({
        formatId,
        startingLp: lp,
        startingHand: hand,
        startingPlayer,
        p1: { name: p1Name || "Player 1", deck: remapDeck(d1, passcodes) },
        p2: { name: p2label || "Player 2", deck: remapDeck(p2List!, passcodes) },
        pve,
      });
      stampNames(state, byId);
      useGameStore.getState().hydrate(state);
      await useGameStore.getState().persist();
      router.push("/play/table");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Playtest</h1>
          <p className="text-sm text-muted">
            Hotseat, duel a bot on a random meta snapshot, or open a friend room with coin flip and hidden hands.
          </p>
        </div>
        <Link href="/play/room" className="rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-zinc-950">
          Duel room
        </Link>
      </div>

      {decks.length < 1 ? (
        <div className="rounded-xl border border-dashed border-line p-6 text-sm text-muted">
          You need at least one deck. <Link href="/decks" className="text-accent">Create or import one.</Link>
        </div>
      ) : (
        <div className="grid gap-4 rounded-xl border border-line bg-bg-elev p-4 md:grid-cols-2">
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="text-muted">Format</span>
            <select value={formatId} onChange={(e) => setFormatId(e.target.value as FormatId)} className="w-full rounded-lg border border-line bg-bg px-3 py-2">
              {FORMAT_LIST.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — {f.description}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-line bg-bg px-3 py-3 text-sm md:col-span-2">
            <input type="checkbox" checked={vsBot} onChange={(e) => setVsBot(e.target.checked)} />
            Duel a bot (random or chosen premade for this format)
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-muted">Your name</span>
            <input value={p1Name} onChange={(e) => setP1Name(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2" />
          </label>
          {!vsBot && (
            <label className="space-y-1 text-sm">
              <span className="text-muted">Player 2 name</span>
              <input value={p2Name} onChange={(e) => setP2Name(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2" />
            </label>
          )}

          <label className="space-y-1 text-sm">
            <span className="text-muted">Your deck</span>
            <select value={p1Deck} onChange={(e) => setP1Deck(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2">
              <option value="">Select…</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.main.length})
                </option>
              ))}
            </select>
          </label>

          {vsBot ? (
            <label className="space-y-1 text-sm">
              <span className="text-muted">Bot deck ({formatId === "master-duel" ? "Master Duel" : "TCG"} snapshots)</span>
              <select value={oppMode} onChange={(e) => setOppMode(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2">
                <option value="random">Random premade</option>
                {premades.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {oppMode !== "random" && (
                <p className="text-xs text-muted">{botProfileFor(oppMode).playstyle}</p>
              )}
            </label>
          ) : (
            <label className="space-y-1 text-sm">
              <span className="text-muted">P2 deck</span>
              <select value={p2Deck} onChange={(e) => setP2Deck(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2">
                <option value="">Select…</option>
                {decks.map((d) => (
                  <option key={`p2-${d.id}`} value={d.id}>
                    {d.name} ({d.main.length})
                  </option>
                ))}
              </select>
            </label>
          )}

          {vsBot && (
            <div className="space-y-2 rounded-xl border border-line bg-bg p-3 text-sm md:col-span-2">
              <div className="text-muted">Who goes first?</div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["first", "I go first"],
                    ["second", "I go second"],
                    ["coin", "Coin flip"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTurnChoice(id)}
                    className={`rounded-xl px-2 py-2 font-medium ${
                      turnChoice === id ? "bg-amber-300 text-zinc-950" : "bg-bg-elev text-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">
                {turnChoice === "coin"
                  ? "Start will flip a coin. If you win the toss, you choose first or second."
                  : turnChoice === "second"
                    ? "Bot opens. You play second."
                    : "You open the duel."}
              </p>
            </div>
          )}

          <label className="space-y-1 text-sm">
            <span className="text-muted">Starting LP</span>
            <input type="number" value={lp} onChange={(e) => setLp(Number(e.target.value) || 0)} className="w-full rounded-lg border border-line bg-bg px-3 py-2" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">Opening hand</span>
            <input type="number" value={hand} onChange={(e) => setHand(Number(e.target.value) || 0)} className="w-full rounded-lg border border-line bg-bg px-3 py-2" />
          </label>

          {err && <p className="text-sm text-danger md:col-span-2">{err}</p>}

          <div className="md:col-span-2">
            <button
              type="button"
              disabled={!canStart || busy || coinPhase !== "idle"}
              onClick={() => requestStart()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-40"
            >
              {busy ? "Starting…" : vsBot && turnChoice === "coin" ? "Flip coin & start" : vsBot ? "Start bot duel" : "Start hotseat duel"}
            </button>
          </div>
        </div>
      )}

      {coinPhase !== "idle" && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-amber-200/25 bg-[linear-gradient(180deg,#162235,#0b101c)] p-6 text-center shadow-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200/90">Coin flip</p>
            <div className={`mx-auto mt-5 grid h-24 w-24 place-items-center rounded-full border-4 border-amber-200/40 bg-gradient-to-br from-amber-200 to-amber-500 text-2xl font-black text-zinc-950 ${coinPhase === "flipping" ? "animate-spin" : ""}`}>
              {coinPhase === "flipping" ? "?" : coinFace === "Heads" ? "H" : "T"}
            </div>
            {coinPhase === "flipping" && <p className="mt-4 text-sm text-white/70">Flipping…</p>}
            {coinPhase === "result" && (
              <>
                <h2 className="mt-4 text-2xl font-semibold">{coinFace}</h2>
                <p className="mt-1 text-sm text-white/70">
                  {tossWinner === "you" ? "You win the toss." : "Lab Bot wins the toss."}
                </p>
                {tossWinner === "you" ? (
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button type="button" disabled={busy} onClick={() => void begin("p1")} className="rounded-2xl bg-amber-300 py-3 font-semibold text-zinc-950">
                      Go first
                    </button>
                    <button type="button" disabled={busy} onClick={() => void begin("p2")} className="rounded-2xl border border-white/20 py-3 font-semibold">
                      Go second
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 space-y-3">
                    <p className="text-sm text-white/60">Bot chooses to go {botPick}. Starting duel…</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void begin(botPick === "first" ? "p2" : "p1")}
                      className="w-full rounded-2xl bg-amber-300 py-3 font-semibold text-zinc-950"
                    >
                      {busy ? "Starting…" : "Continue to duel"}
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="mt-3 text-sm text-white/45 hover:text-white"
                  onClick={() => {
                    setCoinPhase("idle");
                    setBusy(false);
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Saved sessions</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted">No saved tables yet. Local/bot duels autosave on this device.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-bg-elev px-4 py-3 text-sm">
                <div>
                  <div className="font-medium">
                    {s.players.p1.name} vs {s.players.p2.name}
                    {s.pve ? " · bot" : ""}
                  </div>
                  <div className="text-xs text-muted">
                    Turn {s.turn} · {FORMATS[s.formatId].name} · {new Date(s.updatedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-zinc-950"
                    onClick={async () => {
                      await resume(s.id);
                      router.push("/play/table");
                    }}
                  >
                    Resume
                  </button>
                  <button type="button" className="rounded-lg px-3 py-1.5 text-danger" onClick={() => void removeSession(s.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <PlaySetup />
    </Suspense>
  );
}
