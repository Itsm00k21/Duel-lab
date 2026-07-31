"use client";

import { cardImageSrc } from "@/lib/cards/images";
import type { CompactCard } from "@/lib/cards/types";
import type { ChainLink } from "@/lib/rules/chain";
import type { TriggerPrompt } from "@/lib/rules/triggers";
import type { ActivationOption } from "@/lib/rules/activationWindow";
import type { ZoneCard } from "@/lib/game/types";

export type LegalResponse = {
  card: ZoneCard;
  data: CompactCard;
  opt: ActivationOption;
  where: "hand" | "field" | "st" | "gy";
};

/**
 * Master Duel / Nexus style: only shown when YOU have a real choice
 * (optional trigger, or a legal chain response). Empty windows never render.
 */
export function ActivationPrompt({
  prompt,
  card,
  remaining,
  chain,
  legalResponses = [],
  onYes,
  onNo,
  onSkipRest,
  onView,
  onViewZoneCard,
  onPass,
  onActivateResponse,
}: {
  prompt?: TriggerPrompt | null;
  card?: CompactCard;
  remaining?: number;
  chain?: ChainLink[];
  pendingName?: string;
  legalResponses?: LegalResponse[];
  onYes?: () => void;
  onNo?: () => void;
  onSkipRest?: () => void;
  onView?: () => void;
  onViewZoneCard?: (data: CompactCard) => void;
  onPass?: () => void;
  onActivateResponse?: (row: LegalResponse) => void;
}) {
  const src = card ? cardImageSrc(card.imageId, "small") : null;
  const showPrompt = Boolean(prompt);
  const showResponses = legalResponses.length > 0;
  const top = chain?.length ? chain[chain.length - 1] : null;

  if (!showPrompt && !showResponses) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[62] flex justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3">
      <div className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl border border-amber-200/25 bg-[#0c1524]/96 shadow-[0_-12px_40px_rgba(0,0,0,.55)] backdrop-blur-md">
        {top && showResponses && (
          <div className="border-b border-white/10 px-3 py-1.5 text-[11px] text-white/55 sm:px-4">
            Respond to <span className="font-semibold text-amber-100">{top.cardName}</span>
            {top.label ? <span className="text-white/40"> — {top.label.slice(0, 72)}</span> : null}
          </div>
        )}

        {showPrompt && prompt && (
          <div className="flex items-start gap-3 px-3 py-3 sm:px-4">
            <button type="button" className="w-14 shrink-0 sm:w-16" onClick={onView} title="Read this card">
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="w-full rounded-md ring-1 ring-white/15" />
              ) : (
                <div className="grid aspect-[59/86] place-items-center rounded-md bg-black/40 text-[10px]">View</div>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200/80">
                {prompt.mandatory ? "Mandatory effect" : "Effect"}
              </p>
              <h2 className="text-sm font-semibold sm:text-base">Activate “{prompt.cardName}”?</h2>
              <p className="text-[11px] text-white/50">
                After {prompt.eventLabel}
                {remaining && remaining > 1 ? ` · ${remaining} waiting` : ""}
              </p>
              <p className="mt-1 max-h-16 overflow-auto text-xs text-white/80">{prompt.summary}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {!prompt.mandatory && remaining && remaining > 1 && onSkipRest && (
                  <button type="button" className="text-xs text-white/45 hover:text-white" onClick={onSkipRest}>
                    Skip remaining
                  </button>
                )}
                {!prompt.mandatory && (
                  <button type="button" className="min-h-9 rounded-full border border-white/20 px-4 text-xs font-semibold" onClick={onNo}>
                    No
                  </button>
                )}
                <button
                  type="button"
                  className="min-h-9 rounded-full bg-amber-300 px-4 text-xs font-bold text-zinc-950"
                  onClick={onYes}
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        )}

        {showResponses && (
          <div className="px-3 py-3 sm:px-4">
            <div className="flex max-h-36 gap-2 overflow-x-auto pb-1">
              {legalResponses.map((row) => {
                const art = cardImageSrc(row.data.imageId, "small");
                return (
                  <button
                    key={`${row.card.instanceId}-${row.opt.clauseIndex}`}
                    type="button"
                    className="w-[4.4rem] shrink-0 text-left"
                    onClick={() => onActivateResponse?.(row)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onViewZoneCard?.(row.data);
                    }}
                    title={row.opt.reason}
                  >
                    {art ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={art} alt="" className="h-[6.2rem] w-full rounded-md object-cover ring-2 ring-emerald-300/70" />
                    ) : (
                      <div className="grid h-[6.2rem] place-items-center rounded-md bg-emerald-400/15 text-[10px] text-emerald-100 ring-2 ring-emerald-300/50">
                        {row.data.name.slice(0, 12)}
                      </div>
                    )}
                    <div className="mt-1 line-clamp-2 text-[10px] font-semibold leading-tight text-emerald-100">{row.data.name}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[10px] text-white/40">Tap a card below to chain it. Right-click / long-press only reads the card.</p>
              {onPass && (
                <button type="button" className="min-h-9 rounded-full bg-white/10 px-4 text-xs font-semibold" onClick={onPass}>
                  Don&apos;t activate
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
