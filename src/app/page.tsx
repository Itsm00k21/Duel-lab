"use client";

import Link from "next/link";
import { ArrowRight, Database, Layers3, PlaySquare, StickyNote } from "lucide-react";
import { useCardStore } from "@/store/useCardStore";
import { useDeckStore } from "@/store/useDeckStore";

export default function HomePage() {
  const { cards, meta, syncing, error, syncRemote } = useCardStore();
  const decks = useDeckStore((s) => s.decks);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-bg-elev p-8">
        <p className="text-xs uppercase tracking-[0.25em] text-accent">Local playtest foundation</p>
        <h1 className="mt-2 max-w-2xl text-4xl font-semibold tracking-tight">
          Build decks. Test lines. No grind, no shop.
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          Duel Lab is an unofficial local sandbox: every current card cached on your machine, a deck
          builder, a two-player hotseat playmat, plus chain / PSCT / synergy helpers. Effects still
          resolve manually — like a paper proxy table with a rules coach.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/decks"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-zinc-950"
          >
            Open deck builder <ArrowRight size={16} />
          </Link>
          <Link
            href="/play"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-bg-elev-2 px-4 py-2 text-sm"
          >
            Start local duel
          </Link>
          <Link
            href="/play/room"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-bg-elev-2 px-4 py-2 text-sm"
          >
            Duel a friend
          </Link>
          <button
            type="button"
            onClick={() => void syncRemote(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-text"
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Sync card database"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          {
            icon: Database,
            title: "Card DB",
            body: meta
              ? `${cards.length.toLocaleString()} cards · v${meta.version}`
              : "Not synced yet",
          },
          {
            icon: Layers3,
            title: "Decks",
            body: `${decks.length} saved locally`,
          },
          {
            icon: PlaySquare,
            title: "Playmat",
            body: "Hotseat P1/P2 + god view",
          },
          {
            icon: StickyNote,
            title: "Lab notes",
            body: "Per-deck notes + session log",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-line bg-bg-elev p-4">
            <item.icon className="text-accent" size={18} />
            <h2 className="mt-3 font-medium">{item.title}</h2>
            <p className="text-sm text-muted">{item.body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">
        Unofficial fan tool for private testing only. Not affiliated with Konami, NAS, or Master Duel.
        Card data via YGOPRODeck API, cached locally. No official art is bundled.
      </section>
    </div>
  );
}
