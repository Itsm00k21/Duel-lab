"use client";

import type { CompactCard } from "@/lib/cards/types";
import type { PileZone, PlayerId, ZoneCard } from "@/lib/game/types";
import { CardProxy } from "@/components/cards/CardProxy";

export function PileModal({
  title,
  cards,
  byId,
  owner,
  zone,
  onClose,
  onPick,
  onToHand,
  onToField,
  onToGy,
  onTop,
  onBottom,
  onShuffle,
}: {
  title: string;
  cards: ZoneCard[];
  byId: Map<number, CompactCard>;
  owner: PlayerId;
  zone: PileZone;
  onClose: () => void;
  onPick: (card: ZoneCard) => void;
  onToHand: (index: number) => void;
  onToField: (index: number, mode?: "summon-atk" | "summon-def") => void;
  onToGy: (index: number) => void;
  onTop: (index: number) => void;
  onBottom: (index: number) => void;
  onShuffle: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-4xl overflow-auto rounded-2xl border border-line bg-bg-elev p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {zone === "extra" ? title.replace(/\bextra\b/i, "Extra Deck") : title} · {cards.length}
          </h2>
          <div className="flex gap-2">
            {zone === "deck" && (
              <button type="button" className="rounded bg-bg-elev-2 px-3 py-1 text-sm" onClick={onShuffle}>
                Shuffle
              </button>
            )}
            <button type="button" className="rounded bg-bg-elev-2 px-3 py-1 text-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
          {cards.map((card, index) => (
            <div key={card.instanceId} className="space-y-1">
              <CardProxy
                card={byId.get(card.cardId)}
                name={card.name}
                faceUp={zone === "deck" ? true : card.faceUp}
                compact
                onClick={() => onPick(card)}
              />
              {zone === "extra" ? (
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    className="min-h-8 w-full rounded-md bg-amber-300 px-1 text-[11px] font-semibold text-zinc-950"
                    onClick={() => onToField(index, "summon-atk")}
                  >
                    SS ATK
                  </button>
                  <button
                    type="button"
                    className="min-h-8 w-full rounded-md bg-white/10 px-1 text-[11px] font-medium text-white"
                    onClick={() => onToField(index, "summon-def")}
                  >
                    SS DEF
                  </button>
                </div>
              ) : (
                <p className="text-[9px] leading-tight text-white/40">View only</p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted">
          {zone === "extra"
            ? "Tap a card for the Special Summon menu, or use SS ATK / SS DEF."
            : `Owner key: ${owner}. Click a proxy to inspect.`}
        </p>
      </div>
    </div>
  );
}
