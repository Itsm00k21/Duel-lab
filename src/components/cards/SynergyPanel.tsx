"use client";

import type { CompactCard } from "@/lib/cards/types";
import { buildAround, deckGaps, type SynergyIndex } from "@/lib/synergy";

export function SynergyPanel({
  card,
  index,
  deckIds,
  onPick,
}: {
  card: CompactCard;
  index: SynergyIndex | null;
  deckIds?: number[];
  onPick?: (card: CompactCard) => void;
}) {
  if (!index) {
    return <p className="text-sm text-muted">Synergy index still building… sync cards first.</p>;
  }

  const hits = buildAround(card, index, { limit: 20 });
  const mentions = index.mentions.get(card.id) ?? [];
  const gaps = deckIds?.length ? deckGaps(deckIds, index).filter((g) => g.from.id === card.id) : [];

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-muted">
        {hits.length ? `${hits.length > 20 ? "20+" : hits.length} related cards.` : "No links found."} Use{" "}
        <strong>Build around</strong> in the deck editor for the full list and one-click add.
      </p>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Names in text</h4>
        {mentions.length === 0 ? (
          <p className="text-muted">No quoted names.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {mentions.slice(0, 12).map((m) => (
              <li key={`${m.quote}-${m.kind}`}>
                “{m.quote}”{" "}
                <span className="text-xs text-muted">
                  ({m.kind}
                  {m.cardId ? ` · ${index.byId.get(m.cardId)?.name}` : ""})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {gaps.length > 0 && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-2 text-xs">
          <div className="font-semibold text-accent">Missing from this deck</div>
          {gaps.map((g) => (
            <div key={`${g.from.id}-${g.quote}`}>
              {g.from.name} looks for “{g.quote}”
            </div>
          ))}
        </div>
      )}

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Top related</h4>
        <ul className="mt-1 space-y-1">
          {hits.slice(0, 12).map((hit) => (
            <li key={hit.card.id}>
              <button type="button" className="text-left hover:text-accent" onClick={() => onPick?.(hit.card)}>
                {hit.card.name}
              </button>
              <div className="text-[11px] text-muted">{hit.reasons[0]}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
