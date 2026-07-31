"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cardImageSrc } from "@/lib/cards/images";
import { cardKind, kindLabel } from "@/lib/cards/kinds";
import type { CompactCard } from "@/lib/cards/types";
import { cardRoles } from "@/lib/synergy";
import { cn } from "@/lib/utils";
import { useCardStore } from "@/store/useCardStore";

export type ViewerOptions = {
  neighbors?: CompactCard[];
  onAdd?: (card: CompactCard) => void;
  onUse?: (card: CompactCard) => void;
};

type ViewerContextValue = {
  openCard: (card: CompactCard, opts?: ViewerOptions) => void;
  closeCard: () => void;
  card: CompactCard | null;
};

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function useCardViewer() {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error("useCardViewer must be used within CardViewerProvider");
  return ctx;
}

export function useCardViewerOptional() {
  return useContext(ViewerContext);
}

export function CardViewerProvider({ children }: { children: ReactNode }) {
  const [card, setCard] = useState<CompactCard | null>(null);
  const [opts, setOpts] = useState<ViewerOptions>({});

  const closeCard = useCallback(() => {
    setCard(null);
    setOpts({});
  }, []);

  const openCard = useCallback((next: CompactCard, nextOpts?: ViewerOptions) => {
    setCard(next);
    setOpts(nextOpts ?? {});
  }, []);

  const neighbors = opts.neighbors ?? [];
  const index = card ? neighbors.findIndex((c) => c.id === card.id) : -1;

  const go = useCallback(
    (dir: -1 | 1) => {
      if (!card || index < 0 || neighbors.length < 2) return;
      const next = neighbors[(index + dir + neighbors.length) % neighbors.length];
      setCard(next);
    },
    [card, index, neighbors],
  );

  useEffect(() => {
    if (!card) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeCard();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [card, closeCard, go]);

  const value = useMemo(() => ({ openCard, closeCard, card }), [openCard, closeCard, card]);

  return (
    <ViewerContext.Provider value={value}>
      {children}
      {card && (
        <CardOverlay
          card={card}
          opts={opts}
          hasPrev={neighbors.length > 1}
          hasNext={neighbors.length > 1}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onClose={closeCard}
          onOpenRelated={(related) => setCard(related)}
        />
      )}
    </ViewerContext.Provider>
  );
}

function CardOverlay({
  card,
  opts,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onOpenRelated,
}: {
  card: CompactCard;
  opts: ViewerOptions;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onOpenRelated: (card: CompactCard) => void;
}) {
  const [tab, setTab] = useState<"effect" | "details" | "related">("effect");
  const [imgFailed, setImgFailed] = useState(false);
  const synergy = useCardStore((s) => s.synergy);
  const src = cardImageSrc(card.imageId, "full");
  const roles = cardRoles(card);
  const kind = cardKind(card);

  useEffect(() => {
    setTab("effect");
    setImgFailed(false);
  }, [card.id]);

  const related = useMemo(() => {
    if (!synergy) return [];
    return (synergy.mentions.get(card.id) ?? [])
      .map((m) => (m.cardId ? synergy.byId.get(m.cardId) : undefined))
      .filter((c): c is CompactCard => Boolean(c))
      .slice(0, 8);
  }, [card.id, synergy]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={onClose} aria-label="Close" />

      {hasPrev && (
        <button
          type="button"
          onClick={onPrev}
          className="absolute left-2 top-1/2 z-[81] grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/50 text-2xl text-white/80 hover:bg-black/70"
        >
          ‹
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          onClick={onNext}
          className="absolute right-2 top-1/2 z-[81] grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-black/50 text-2xl text-white/80 hover:bg-black/70"
        >
          ›
        </button>
      )}

      <div className="card-viewer relative z-[82] grid max-h-[96dvh] w-full max-w-4xl overflow-hidden rounded-t-3xl border border-accent/25 bg-[linear-gradient(180deg,#141c2e_0%,#0b101c_100%)] shadow-[0_30px_80px_rgba(0,0,0,0.65)] max-md:mt-auto md:rounded-3xl md:grid-cols-[minmax(240px,320px)_1fr]">
        <div className="relative flex items-center justify-center bg-black/40 p-4 md:p-6">
          <div className="w-full max-w-[280px]">
            {src && !imgFailed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={card.name}
                className="w-full rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="aspect-[59/86] rounded-xl border border-line bg-bg-elev p-4">
                <div className="text-sm font-semibold">{card.name}</div>
                <p className="mt-3 text-xs text-muted">{card.desc}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="border-b border-white/10 px-5 pb-3 pt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.2em] text-accent/90">{kindLabel(kind)}</p>
                <h2 className="mt-1 text-2xl font-semibold leading-tight tracking-tight">{card.name}</h2>
                <p className="mt-1 text-sm text-muted">
                  {card.type}
                  {card.archetype ? ` · ${card.archetype}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-muted hover:bg-white/10 hover:text-text"
              >
                Close
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {card.attribute && <Chip>{card.attribute}</Chip>}
              {card.race && <Chip>{card.race}</Chip>}
              {card.level != null && <Chip>★ {card.level}</Chip>}
              {card.scale != null && <Chip>Scale {card.scale}</Chip>}
              {card.linkval != null && <Chip>LINK-{card.linkval}</Chip>}
              {card.banTcg && <Chip accent>{card.banTcg}</Chip>}
              {roles.slice(0, 3).map((role) => (
                <Chip key={role}>{role}</Chip>
              ))}
            </div>
          </div>

          <div className="flex gap-1 border-b border-white/10 px-5 py-2 text-xs">
            {(
              [
                ["effect", "Effect"],
                ["details", "Details"],
                ["related", "Related"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "rounded-full px-3 py-1 font-medium",
                  tab === id ? "bg-accent text-zinc-950" : "text-muted hover:bg-white/5 hover:text-text",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-[220px] flex-1 overflow-auto px-5 py-4">
            {tab === "effect" && (
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-text/95">{card.desc || "No effect text."}</p>
            )}
            {tab === "details" && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Row label="Passcode" value={String(card.id)} />
                {card.atk != null && <Row label="ATK" value={String(card.atk)} />}
                {card.def != null && <Row label="DEF" value={String(card.def)} />}
                {card.linkmarkers?.length ? <Row label="Arrows" value={card.linkmarkers.join(", ")} /> : null}
                {card.tcgDate && <Row label="TCG" value={card.tcgDate} />}
                {card.genesys != null && <Row label="Genesys" value={`${card.genesys} pts`} />}
                {card.treatedAs && <Row label="Treated as" value={card.treatedAs} />}
              </dl>
            )}
            {tab === "related" && (
              <div className="space-y-2">
                {related.length === 0 && <p className="text-sm text-muted">No named related cards in the text.</p>}
                {related.map((rel) => (
                  <button
                    key={rel.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm hover:border-accent/40"
                    onClick={() => onOpenRelated(rel)}
                  >
                    <span>{rel.name}</span>
                    <span className="text-xs text-muted">{rel.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-black/25 px-5 py-3">
            {(card.atk != null || card.def != null || card.linkval != null) && (
              <div className="mr-auto font-mono text-sm tracking-wide text-accent">
                {card.atk != null ? `ATK ${card.atk}` : ""}
                {card.atk != null && card.def != null ? " / " : ""}
                {card.def != null ? `DEF ${card.def}` : ""}
                {card.linkval != null ? `  LINK-${card.linkval}` : ""}
              </div>
            )}
            {opts.onUse && (
              <button
                type="button"
                className="rounded-xl border border-line bg-bg-elev-2 px-3 py-2 text-sm"
                onClick={() => {
                  opts.onUse?.(card);
                  onClose();
                }}
              >
                Build around
              </button>
            )}
            {opts.onAdd && (
              <button
                type="button"
                className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-zinc-950"
                onClick={() => opts.onAdd?.(card)}
              >
                Add to deck
              </button>
            )}
            {!opts.onAdd && !opts.onUse && (
              <p className="ml-auto text-[11px] text-muted">Esc to close · ← → if browsing</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Chip({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5",
        accent ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 bg-white/5 text-muted",
      )}
    >
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </>
  );
}
