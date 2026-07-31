"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { DeckStudio } from "@/components/deck/DeckStudio";
import type { DeckList } from "@/lib/deck/types";
import { useDeckStore } from "@/store/useDeckStore";

export default function DeckEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const get = useDeckStore((s) => s.get);
  const load = useDeckStore((s) => s.load);
  const [deck, setDeck] = useState<DeckList | null | undefined>(undefined);

  useEffect(() => {
    void (async () => {
      await load();
      setDeck((await get(id)) ?? null);
    })();
  }, [get, id, load]);

  if (deck === undefined) return <p className="text-sm text-muted">Loading deck…</p>;
  if (!deck) {
    return (
      <div className="space-y-3">
        <p>Deck not found.</p>
        <Link href="/decks" className="text-accent">
          Back to decks
        </Link>
      </div>
    );
  }

  return <DeckStudio initial={deck} />;
}
