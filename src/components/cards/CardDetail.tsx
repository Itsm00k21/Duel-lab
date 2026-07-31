"use client";

import { useState } from "react";
import type { CompactCard } from "@/lib/cards/types";
import { useCardStore } from "@/store/useCardStore";
import { CardProxy } from "./CardProxy";
import { PsctBreakdown } from "./PsctBreakdown";
import { SynergyPanel } from "./SynergyPanel";

type Tab = "text" | "psct" | "synergy";

export function CardDetail({
  card,
  deckIds,
  onPick,
}: {
  card: CompactCard | null;
  deckIds?: number[];
  onPick?: (card: CompactCard) => void;
}) {
  const synergy = useCardStore((s) => s.synergy);
  const [tab, setTab] = useState<Tab>("text");

  if (!card) {
    return (
      <div className="rounded-xl border border-line bg-bg-elev p-4 text-sm text-muted">
        Select a card to read text, PSCT breakdown, and what it works with.
      </div>
    );
  }

  return (
    <aside className="rounded-xl border border-line bg-bg-elev p-4">
      <div className="mx-auto w-40">
        <CardProxy card={card} />
      </div>
      <h2 className="mt-3 text-base font-semibold leading-snug">{card.name}</h2>
      <p className="text-xs text-muted">
        {card.type}
        {card.archetype ? ` · ${card.archetype}` : ""}
        {card.attribute ? ` · ${card.attribute}` : ""}
        {card.level != null ? ` · ★${card.level}` : ""}
        {card.linkval != null ? ` · LINK-${card.linkval}` : ""}
      </p>
      <div className="mt-3 flex gap-1 text-xs">
        {(["text", "psct", "synergy"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-2 py-1 capitalize ${tab === t ? "bg-accent text-zinc-950" : "bg-bg-elev-2 text-muted"}`}
          >
            {t === "psct" ? "PSCT" : t}
          </button>
        ))}
      </div>
      <div className="mt-3 max-h-[48vh] overflow-auto pr-1">
        {tab === "text" && (
          <div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{card.desc}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
              {card.banTcg && (
                <>
                  <dt>TCG</dt>
                  <dd className="text-right text-accent">{card.banTcg}</dd>
                </>
              )}
              {card.banMd && (
                <>
                  <dt>Master Duel</dt>
                  <dd className="text-right text-accent">{card.banMd}</dd>
                </>
              )}
              {card.genesys != null && (
                <>
                  <dt>Genesys</dt>
                  <dd className="text-right">{card.genesys} pts</dd>
                </>
              )}
              <dt>Passcode</dt>
              <dd className="text-right font-mono">{card.id}</dd>
              {card.imageId != null && (
                <>
                  <dt>Art id</dt>
                  <dd className="text-right font-mono">
                    {card.imageId}
                    {card.imageMatch ? ` · ${card.imageMatch}` : ""}
                  </dd>
                </>
              )}
            </dl>
          </div>
        )}
        {tab === "psct" && <PsctBreakdown card={card} />}
        {tab === "synergy" && (
          <SynergyPanel card={card} index={synergy} deckIds={deckIds} onPick={onPick} />
        )}
      </div>
    </aside>
  );
}
