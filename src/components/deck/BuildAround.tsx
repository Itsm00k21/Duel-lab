"use client";

import { useMemo, useState } from "react";
import { CardProxy } from "@/components/cards/CardProxy";
import { TypeTabs } from "@/components/deck/TypeTabs";
import { cardKind, type CardKind } from "@/lib/cards/kinds";
import { searchCards } from "@/lib/cards/search";
import type { CompactCard } from "@/lib/cards/types";
import { buildAround, type SynergyIndex } from "@/lib/synergy";
import { cn } from "@/lib/utils";

export function BuildAround({
  seed,
  index,
  allCards,
  deckIds,
  onSeedChange,
  onAdd,
  onInspect,
}: {
  seed: CompactCard | null;
  index: SynergyIndex | null;
  allCards: CompactCard[];
  deckIds: number[];
  onSeedChange: (card: CompactCard) => void;
  onAdd: (card: CompactCard, copies?: number) => void;
  onInspect?: (card: CompactCard, neighbors?: CompactCard[]) => void;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<CardKind | "all">("all");
  const [missingOnly, setMissingOnly] = useState(true);

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const id of deckIds) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [deckIds]);

  const picker = useMemo(() => (q.trim() ? searchCards(allCards, { text: q }, 10) : []), [allCards, q]);
  const hits = useMemo(() => {
    if (!seed || !index) return [];
    return buildAround(seed, index);
  }, [seed, index]);

  const kindCounts = useMemo(() => {
    const c: Partial<Record<CardKind | "all", number>> = { all: hits.length };
    for (const hit of hits) {
      const k = cardKind(hit.card);
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [hits]);

  const visible = useMemo(() => {
    return hits.filter((hit) => {
      if (missingOnly && counts.has(hit.card.id)) return false;
      if (kind !== "all" && cardKind(hit.card) !== kind) return false;
      return true;
    });
  }, [hits, kind, missingOnly, counts]);
  const visibleCards = useMemo(() => visible.map((h) => h.card), [visible]);

  return (
    <section className="flex min-h-0 flex-col rounded-2xl border border-line bg-bg-elev/90 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Works with</h2>
          <p className="text-[11px] text-muted">Support split by card type. Add what you need.</p>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={missingOnly}
            onChange={(e) => setMissingOnly(e.target.checked)}
          />
          Not in deck
        </label>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Build around… Dark Magician"
        className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm"
      />
      {q.trim() && (
        <ul className="mt-1 max-h-40 overflow-auto rounded-xl border border-line bg-bg text-sm">
          {picker.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-bg-elev-2"
                onClick={() => {
                  onSeedChange(card);
                  setQ("");
                }}
              >
                <span className="w-8 shrink-0">
                  <CardProxy card={card} compact />
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{card.name}</span>
                  <span className="text-[11px] text-muted">{card.archetype ?? card.type}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!seed ? (
        <p className="mt-6 text-center text-sm text-muted">
          Search a boss or engine starter.<br />We’ll sort every partner into Monsters, Spells, Traps, Fusion…
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-bg p-2">
            <div className="w-12 shrink-0">
              <CardProxy card={seed} compact onClick={() => onInspect?.(seed, [seed, ...visibleCards])} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{seed.name}</div>
              <div className="text-[11px] text-muted">
                {seed.archetype ?? seed.type} · {hits.length} partners
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-zinc-950"
              onClick={() => onAdd(seed, 3)}
            >
              +3
            </button>
          </div>

          <div className="mt-2">
            <TypeTabs value={kind} onChange={setKind} counts={kindCounts} compact />
          </div>

          <ul className="mt-2 max-h-[52vh] space-y-1.5 overflow-auto pr-0.5">
            {visible.map((hit) => {
              const n = counts.get(hit.card.id) ?? 0;
              const k = cardKind(hit.card);
              return (
                <li key={hit.card.id} className="rounded-xl border border-line/70 bg-bg p-1.5">
                  <div className="flex gap-2">
                    <div className="w-12 shrink-0">
                      <CardProxy card={hit.card} compact onClick={() => onInspect?.(hit.card, visibleCards)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          className="truncate text-left text-xs font-semibold hover:text-accent"
                          onClick={() => onInspect?.(hit.card, visibleCards)}
                        >
                          {hit.card.name}
                        </button>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                          {k}
                          {n ? ` · ${n}×` : ""}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted">{hit.reasons[0]}</p>
                      <div className="mt-1.5 flex gap-1">
                        <button
                          type="button"
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[11px] font-semibold",
                            "bg-accent text-zinc-950 hover:opacity-90",
                          )}
                          onClick={() => onAdd(hit.card, 1)}
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          className="rounded-md bg-bg-elev-2 px-2 py-0.5 text-[11px] hover:bg-bg-elev"
                          onClick={() => onAdd(hit.card, 3)}
                        >
                          +3
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
            {visible.length === 0 && (
              <li className="py-8 text-center text-xs text-muted">Nothing in this type filter.</li>
            )}
          </ul>
        </>
      )}
    </section>
  );
}
