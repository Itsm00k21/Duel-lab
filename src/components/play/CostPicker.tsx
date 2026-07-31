"use client";

import { useMemo, useState } from "react";
import { CardProxy } from "@/components/cards/CardProxy";
import type { CompactCard } from "@/lib/cards/types";
import type { ZoneRef } from "@/lib/game/types";
import type { CostSpec } from "@/lib/rules/activationCost";

export function CostPicker({
  title,
  spec,
  lp,
  candidates,
  onConfirm,
  onCancel,
  range,
  heading = "Pay cost",
}: {
  title: string;
  spec: CostSpec;
  lp?: number;
  candidates: Array<{ ref: ZoneRef; data?: CompactCard; label: string; instanceId: string }>;
  onConfirm: (picks: ZoneRef[]) => void;
  onCancel: () => void;
  range?: { min: number; max: number };
  heading?: string;
}) {
  const need = spec.self || spec.kind === "pay-lp" || spec.kind === "detach" ? 0 : spec.count;
  const minNeed = range?.min ?? need;
  const maxNeed = range?.max ?? spec.count;
  const [picked, setPicked] = useState<string[]>(() =>
    spec.self && candidates[0] ? [candidates[0].instanceId] : candidates.length === need && need > 0 ? candidates.map((c) => c.instanceId) : [],
  );

  const selected = useMemo(
    () => candidates.filter((c) => picked.includes(c.instanceId)),
    [candidates, picked],
  );

  function toggle(id: string) {
    if (spec.self || spec.kind === "pay-lp") return;
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (spec.source === "hand-or-field" || range) {
        if (cur.length >= maxNeed) return [...cur.slice(1), id];
        return [...cur, id];
      }
      if (cur.length >= spec.count) return [...cur.slice(1), id];
      return [...cur, id];
    });
  }

  const ready =
    spec.kind === "pay-lp" || spec.kind === "detach" || spec.self
      ? true
      : spec.source === "hand-or-field"
        ? selected.length >= 1
        : range
          ? selected.length >= minNeed && selected.length <= maxNeed
          : selected.length >= spec.count;

  return (
    <div className="fixed inset-0 z-[77] grid place-items-end sm:place-items-center">
      <button type="button" className="absolute inset-0 bg-black/75" onClick={onCancel} aria-label="Cancel cost" />
      <div className="relative z-[78] w-full max-w-3xl overflow-hidden rounded-t-3xl border border-amber-200/25 bg-[#0c1524] shadow-2xl sm:rounded-3xl">
        <div className="border-b border-white/10 px-5 py-3 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-200/90">{heading}</p>
          <h2 className="mt-1 text-lg font-semibold">{title}</h2>
          <p className="text-sm text-white/60">{spec.label}</p>
          {spec.kind === "pay-lp" && <p className="mt-1 text-amber-200">Current LP {lp ?? "?"}</p>}
        </div>
        {spec.kind !== "pay-lp" && spec.kind !== "detach" && (
          <div className="max-h-[50dvh] overflow-auto px-4 py-4">
            {candidates.length === 0 ? (
              <p className="py-8 text-center text-sm text-white/50">No legal cards to pay this cost.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {candidates.map((row) => (
                  <button
                    key={row.instanceId}
                    type="button"
                    onClick={() => toggle(row.instanceId)}
                    className={`rounded-lg ${picked.includes(row.instanceId) ? "ring-2 ring-amber-300" : "ring-1 ring-white/10"}`}
                  >
                    <CardProxy card={row.data} name={row.label} compact />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
          <button type="button" className="min-h-11 rounded-full border border-white/20 px-5 text-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            className="min-h-11 rounded-full bg-amber-300 px-6 text-sm font-bold text-zinc-950 disabled:opacity-40"
            onClick={() => onConfirm(selected.map((s) => s.ref))}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
