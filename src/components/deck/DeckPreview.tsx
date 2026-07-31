"use client";

import { useMemo } from "react";
import { useCardViewer } from "@/components/cards/CardViewer";
import { CardProxy } from "@/components/cards/CardProxy";
import { cardKind } from "@/lib/cards/kinds";
import type { CompactCard } from "@/lib/cards/types";
import type { PremadeDeck } from "@/data/premade-decks";
import { materializePremade } from "@/lib/deck/premade";
import type { DeckList } from "@/lib/deck/types";
import { FORMATS } from "@/lib/deck/formats";

type PreviewModel = {
  title: string;
  subtitle: string;
  notes?: string;
  main: CompactCard[];
  extra: CompactCard[];
  side: CompactCard[];
  missing: string[];
  formatLabel: string;
};

function inflate(ids: number[], byId: Map<number, CompactCard>) {
  return ids.map((id) => byId.get(id)).filter((c): c is CompactCard => Boolean(c));
}

function stack(cards: CompactCard[]) {
  const order: CompactCard[] = [];
  const counts = new Map<number, number>();
  for (const card of cards) {
    if (!counts.has(card.id)) order.push(card);
    counts.set(card.id, (counts.get(card.id) ?? 0) + 1);
  }
  return order.map((card) => ({ card, count: counts.get(card.id)! }));
}

function group(cards: CompactCard[], extra = false) {
  const bins: Record<string, ReturnType<typeof stack>> = extra
    ? { Fusion: [], Synchro: [], Xyz: [], Link: [], Other: [] }
    : { Monster: [], Spell: [], Trap: [], Other: [] };
  for (const row of stack(cards)) {
    const k = cardKind(row.card);
    if (extra) {
      const label = k === "fusion" ? "Fusion" : k === "synchro" ? "Synchro" : k === "xyz" ? "Xyz" : k === "link" ? "Link" : "Other";
      bins[label].push(row);
    } else {
      const label = k === "spell" ? "Spell" : k === "trap" ? "Trap" : k === "other" ? "Other" : "Monster";
      bins[label].push(row);
    }
  }
  return Object.entries(bins).filter(([, list]) => list.length);
}

export function DeckPreviewModal({
  userDeck,
  premade,
  cards,
  byId,
  onClose,
  onClone,
  onEdit,
  cloning,
}: {
  userDeck?: DeckList | null;
  premade?: PremadeDeck | null;
  cards: CompactCard[];
  byId: Map<number, CompactCard>;
  onClose: () => void;
  onClone?: () => void;
  onEdit?: () => void;
  cloning?: boolean;
}) {
  const { openCard } = useCardViewer();
  const model = useMemo<PreviewModel | null>(() => {
    if (premade) {
      const { deck, missing } = materializePremade(premade, cards);
      return {
        title: premade.name,
        subtitle: premade.description,
        notes: `${premade.source} (${premade.sourceDate})`,
        main: inflate(deck.main, byId),
        extra: inflate(deck.extra, byId),
        side: inflate(deck.side, byId),
        missing,
        formatLabel: premade.format === "tcg" ? "TCG Advanced" : "Master Duel sandbox",
      };
    }
    if (userDeck) {
      return {
        title: userDeck.name,
        subtitle: FORMATS[userDeck.formatId]?.name ?? userDeck.formatId,
        notes: userDeck.notes || undefined,
        main: inflate(userDeck.main, byId),
        extra: inflate(userDeck.extra, byId),
        side: inflate(userDeck.side, byId),
        missing: [],
        formatLabel: FORMATS[userDeck.formatId]?.name ?? userDeck.formatId,
      };
    }
    return null;
  }, [premade, userDeck, cards, byId]);

  if (!model) return null;

  const all = [...model.main, ...model.extra, ...model.side];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6">
      <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-label="Close preview" />
      <div className="relative z-[71] flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-line bg-bg-elev shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{model.formatLabel}</p>
            <h2 className="text-2xl font-semibold">{model.title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">{model.subtitle}</p>
            <p className="mt-1 font-mono text-xs text-muted">
              {model.main.length}/{model.extra.length}/{model.side.length} main/extra/side
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onEdit && (
              <button type="button" onClick={onEdit} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-zinc-950">
                Edit
              </button>
            )}
            {onClone && (
              <button
                type="button"
                disabled={cloning}
                onClick={onClone}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
              >
                {cloning ? "Cloning…" : "Clone & edit"}
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm">
              Close
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto px-5 py-4">
          {model.notes && <p className="whitespace-pre-wrap text-xs text-muted">{model.notes}</p>}
          {model.missing.length > 0 && (
            <p className="text-xs text-accent">Missing from local DB: {model.missing.join(", ")}</p>
          )}
          <Section title="Main Deck" cards={model.main} extra={false} onOpen={(c) => openCard(c, { neighbors: all })} />
          <Section title="Extra Deck" cards={model.extra} extra onOpen={(c) => openCard(c, { neighbors: all })} />
          {model.side.length > 0 && (
            <Section title="Side Deck" cards={model.side} extra={false} onOpen={(c) => openCard(c, { neighbors: all })} />
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  cards,
  extra,
  onOpen,
}: {
  title: string;
  cards: CompactCard[];
  extra: boolean;
  onOpen: (card: CompactCard) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-xs text-muted">{cards.length} cards</span>
      </div>
      {cards.length === 0 ? (
        <p className="text-xs text-muted">None</p>
      ) : (
        group(cards, extra).map(([label, rows]) => (
          <div key={label} className="mb-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-8 md:grid-cols-10">
              {rows.map(({ card, count }) => (
                <div key={card.id} className="relative">
                  <CardProxy card={card} compact onClick={() => onOpen(card)} />
                  <span className="pointer-events-none absolute -right-1 -top-1 rounded-full bg-accent px-1 text-[10px] font-bold text-zinc-950">
                    {count}×
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
