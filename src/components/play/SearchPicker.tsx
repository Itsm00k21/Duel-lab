"use client";

import { useMemo, useState } from "react";
import { CardProxy } from "@/components/cards/CardProxy";
import { useCardViewer } from "@/components/cards/CardViewer";
import type { CompactCard } from "@/lib/cards/types";
import type { ZoneCard } from "@/lib/game/types";
import type { SearchSource, SearchSpec } from "@/lib/rules/searchEffect";

export function SearchPicker({
  title,
  spec,
  sourceLabel,
  candidates,
  onPick,
  onCancel,
}: {
  title: string;
  spec: SearchSpec;
  sourceLabel: string;
  candidates: Array<{ card: ZoneCard; data: CompactCard; index: number; source: SearchSource }>;
  onPick: (index: number, data: CompactCard, source: SearchSource) => void;
  onCancel: () => void;
}) {
  const { openCard } = useCardViewer();
  const [chosen, setChosen] = useState<string | null>(
    candidates.length === 1 ? `${candidates[0]!.source}:${candidates[0]!.index}` : null,
  );
  const picked = useMemo(
    () => candidates.find((c) => `${c.source}:${c.index}` === chosen) ?? null,
    [candidates, chosen],
  );

  return (
    <div className="fixed inset-0 z-[78] grid place-items-end p-0 sm:place-items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-[2px]" onClick={onCancel} aria-label="Cancel search" />
      <div className="relative z-[79] flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-amber-200/25 bg-[linear-gradient(180deg,#121c2e,#070c14)] shadow-2xl sm:rounded-3xl">
        <div className="border-b border-white/10 px-5 py-3 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200/90">Select a card</p>
          <h2 className="mt-1 text-lg font-semibold">{title}</h2>
          <p className="text-xs text-white/50">
            {spec.label} · {sourceLabel} · {candidates.length} legal
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
          {candidates.length === 0 ? (
            <p className="py-10 text-center text-sm text-white/55">No legal cards in {sourceLabel}.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              {candidates.map((row) => (
                <button
                  key={`${row.source}-${row.card.instanceId}-${row.index}`}
                  type="button"
                  className={`relative rounded-lg ${chosen === `${row.source}:${row.index}` ? "ring-2 ring-amber-300" : "ring-1 ring-white/10"}`}
                  onClick={() => setChosen(`${row.source}:${row.index}`)}
                  onDoubleClick={() => onPick(row.index, row.data, row.source)}
                >
                  <CardProxy card={row.data} compact />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-black/30 px-4 py-3">
          {picked && (
            <button type="button" className="mr-auto text-sm text-white/60 hover:text-white" onClick={() => openCard(picked.data)}>
              View {picked.data.name}
            </button>
          )}
          <button type="button" className="min-h-11 rounded-full border border-white/20 px-5 text-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            disabled={chosen == null || !picked}
            className="min-h-11 rounded-full bg-amber-300 px-6 text-sm font-bold text-zinc-950 disabled:opacity-40"
            onClick={() => picked && onPick(picked.index, picked.data, picked.source)}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
