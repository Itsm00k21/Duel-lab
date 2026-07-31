"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCardViewer } from "@/components/cards/CardViewer";
import { CardProxy } from "@/components/cards/CardProxy";
import { TypeTabs } from "@/components/deck/TypeTabs";
import { cardKind, isExtraKind, type CardKind } from "@/lib/cards/kinds";
import { buildPasscodeMap, remapDeck } from "@/lib/cards/passcodes";
import { searchCards } from "@/lib/cards/search";
import type { CompactCard } from "@/lib/cards/types";
import { FORMAT_LIST } from "@/lib/deck/formats";
import { suggestedSection, validateDeck, deckStats } from "@/lib/deck/validation";
import type { DeckList } from "@/lib/deck/types";
import { buildAround } from "@/lib/synergy";
import { fromYdk, toYdk } from "@/lib/deck/ydk";
import { cn, downloadText, readFileAsText } from "@/lib/utils";
import { useCardStore } from "@/store/useCardStore";
import { useDeckStore } from "@/store/useDeckStore";

type Section = "main" | "extra" | "side";
type LeftMode = "search" | "related";

function stacks(ids: number[]) {
  const order: number[] = [];
  const map = new Map<number, number>();
  for (const id of ids) {
    if (!map.has(id)) order.push(id);
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return order.map((id) => ({ id, count: map.get(id)! }));
}

export function DeckStudio({ initial }: { initial: DeckList }) {
  const router = useRouter();
  const cards = useCardStore((s) => s.cards);
  const byId = useCardStore((s) => s.byId);
  const synergy = useCardStore((s) => s.synergy);
  const save = useDeckStore((s) => s.save);
  const remove = useDeckStore((s) => s.remove);
  const { openCard } = useCardViewer();

  const [deck, setDeck] = useState(initial);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<CardKind | "all">("all");
  const [mode, setMode] = useState<LeftMode>("search");
  const [seed, setSeed] = useState<CompactCard | null>(null);
  const [saved, setSaved] = useState(false);
  const [missingOnly, setMissingOnly] = useState(true);
  const [pane, setPane] = useState<"catalog" | "list">("catalog");

  const stats = useMemo(() => deckStats(deck, byId), [deck, byId]);
  const issues = useMemo(() => validateDeck(deck, byId), [deck, byId]);
  const deckIds = useMemo(() => [...deck.main, ...deck.extra, ...deck.side], [deck]);

  const catalog = useMemo(() => searchCards(cards, { text: q, kind }, 96), [cards, q, kind]);
  const related = useMemo(() => {
    if (!seed || !synergy) return [];
    return buildAround(seed, synergy).filter((hit) => {
      if (kind !== "all" && cardKind(hit.card) !== kind) return false;
      if (missingOnly && deckIds.includes(hit.card.id)) return false;
      return true;
    });
  }, [seed, synergy, kind, missingOnly, deckIds]);

  function update(partial: Partial<DeckList>) {
    setDeck((d) => ({ ...d, ...partial }));
  }

  function add(card: CompactCard, copies = 1, section?: Section) {
    const dest =
      section ??
      (suggestedSection(card) === "extra" || isExtraKind(cardKind(card)) ? "extra" : "main");
    update({ [dest]: [...deck[dest], ...Array.from({ length: copies }, () => card.id)] });
    setSeed((s) => s ?? card);
  }

  function removeOne(section: Section, id: number) {
    const list = [...deck[section]];
    const i = list.lastIndexOf(id);
    if (i >= 0) {
      list.splice(i, 1);
      update({ [section]: list });
    }
  }

  async function persist() {
    const next = remapDeck(deck, buildPasscodeMap(cards));
    setDeck(next);
    await save(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1000);
  }

  function inspect(card: CompactCard, neighbors: CompactCard[]) {
    openCard(card, {
      neighbors,
      onAdd: (c) => add(c),
      onUse: (c) => {
        setSeed(c);
        setMode("related");
      },
    });
  }

  const leftCards: CompactCard[] =
    mode === "search" ? catalog : related.map((r) => r.card);

  return (
    <div className="flex h-[calc(100dvh-8.75rem)] flex-col gap-2 md:h-[calc(100dvh-5.5rem)]">
      <header className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-bg-elev px-3 py-2">
        <button type="button" className="text-sm text-muted hover:text-text" onClick={() => router.push("/decks")}>
          ← Decks
        </button>
        <input
          value={deck.name}
          onChange={(e) => update({ name: e.target.value })}
          className="min-w-40 flex-1 rounded-xl border border-line bg-bg px-3 py-1.5 text-sm font-semibold"
        />
        <select
          value={deck.formatId}
          onChange={(e) => update({ formatId: e.target.value as DeckList["formatId"] })}
          className="rounded-xl border border-line bg-bg px-2 py-1.5 text-sm"
        >
          {FORMAT_LIST.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <div className="rounded-xl bg-bg px-3 py-1.5 font-mono text-xs">
          <span className={cn(stats.main < 40 || stats.main > 60 ? "text-danger" : "text-ok")}>{stats.main}</span>
          <span className="text-muted"> / {stats.extra} / {stats.side}</span>
        </div>
        <button type="button" onClick={() => void persist()} className="rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-zinc-950">
          {saved ? "Saved" : "Save"}
        </button>
        <button type="button" className="rounded-xl border border-line px-3 py-1.5 text-sm" onClick={() => downloadText(`${deck.name.replace(/\s+/g, "_")}.ydk`, toYdk(deck))}>
          Export
        </button>
        <label className="cursor-pointer rounded-xl border border-line px-3 py-1.5 text-sm">
          Import
          <input
            type="file"
            accept=".ydk,text/plain"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const imported = fromYdk(await readFileAsText(file), {
                name: file.name.replace(/\.ydk$/i, ""),
                formatId: deck.formatId,
              });
              setDeck(remapDeck({ ...imported, id: deck.id, notes: deck.notes }, buildPasscodeMap(cards)));
            }}
          />
        </label>
        <button
          type="button"
          className="rounded-xl border border-danger/40 px-3 py-1.5 text-sm text-danger"
          onClick={async () => {
            if (!confirm("Delete this deck?")) return;
            await remove(deck.id);
            router.push("/decks");
          }}
        >
          Delete
        </button>
      </header>

      {issues.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {issues.slice(0, 5).map((issue) => (
            <span key={issue.message} className={cn("rounded-full px-2 py-0.5", issue.level === "error" ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent")}>
              {issue.message}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-full bg-bg-elev p-1 text-sm lg:hidden">
        <button type="button" className={cn("rounded-full py-2", pane === "catalog" && "bg-accent font-semibold text-zinc-950")} onClick={() => setPane("catalog")}>
          Catalog
        </button>
        <button type="button" className={cn("rounded-full py-2", pane === "list" && "bg-accent font-semibold text-zinc-950")} onClick={() => setPane("list")}>
          Deck ({stats.main})
        </button>
      </div>

      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(320px,1fr)_minmax(380px,1.1fr)]">
        <section className={cn("min-h-0 flex-col rounded-2xl border border-line bg-bg-elev/90 p-3", pane === "catalog" ? "flex" : "hidden lg:flex")}>
          <div className="mb-2 flex gap-1 rounded-full bg-bg p-0.5 text-xs">
            <button type="button" className={cn("flex-1 rounded-full py-1.5", mode === "search" ? "bg-accent font-semibold text-zinc-950" : "text-muted")} onClick={() => setMode("search")}>
              Card catalog
            </button>
            <button type="button" className={cn("flex-1 rounded-full py-1.5", mode === "related" ? "bg-accent font-semibold text-zinc-950" : "text-muted")} onClick={() => setMode("related")}>
              Works with
            </button>
          </div>
          {mode === "search" ? (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cards…" className="rounded-xl border border-line bg-bg px-3 py-2 text-sm" />
          ) : (
            <input
              value={seed?.name ?? ""}
              onChange={(e) => {
                const hit = searchCards(cards, { text: e.target.value }, 1)[0];
                if (hit) setSeed(hit);
              }}
              placeholder="Build around… e.g. Dark Magician"
              className="rounded-xl border border-line bg-bg px-3 py-2 text-sm"
            />
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <TypeTabs value={kind} onChange={setKind} compact />
            {mode === "related" && (
              <label className="shrink-0 text-[11px] text-muted">
                <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} className="mr-1" />
                Missing
              </label>
            )}
          </div>
          {mode === "related" && seed && (
            <p className="mt-1 text-[11px] text-muted">
              Showing partners for <span className="text-text">{seed.name}</span>
            </p>
          )}
          <div className="mt-2 grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-auto pr-1 sm:grid-cols-4 xl:grid-cols-5">
            {leftCards.map((card) => (
              <div key={card.id} className="group">
                <CardProxy card={card} compact onClick={() => inspect(card, leftCards)} />
                <button
                  type="button"
                  className="mt-1 w-full rounded-md bg-accent py-1 text-[10px] font-semibold text-zinc-950"
                  onClick={() => add(card)}
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className={cn("min-h-0 flex-col overflow-auto rounded-2xl border border-line bg-bg-elev/90 p-3", pane === "list" ? "flex" : "hidden lg:flex")}>
          <DeckBin title="Main Deck" count={stats.main} cap="40–60" ids={deck.main} byId={byId} onMinus={(id) => removeOne("main", id)} onPlus={(c) => add(c, 1, "main")} onOpen={(c, list) => inspect(c, list)} />
          <DeckBin title="Extra Deck" count={stats.extra} cap="0–15" ids={deck.extra} byId={byId} onMinus={(id) => removeOne("extra", id)} onPlus={(c) => add(c, 1, "extra")} onOpen={(c, list) => inspect(c, list)} />
          <DeckBin title="Side Deck" count={stats.side} cap="0–15" ids={deck.side} byId={byId} onMinus={(id) => removeOne("side", id)} onPlus={(c) => add(c, 1, "side")} onOpen={(c, list) => inspect(c, list)} />
          <textarea
            value={deck.notes}
            onChange={(e) => update({ notes: e.target.value })}
            rows={3}
            placeholder="Notes…"
            className="mt-3 w-full rounded-xl border border-line bg-bg px-3 py-2 text-xs"
          />
        </section>
      </div>
    </div>
  );
}

function DeckBin({
  title,
  count,
  cap,
  ids,
  byId,
  onMinus,
  onPlus,
  onOpen,
}: {
  title: string;
  count: number;
  cap: string;
  ids: number[];
  byId: Map<number, CompactCard>;
  onMinus: (id: number) => void;
  onPlus: (card: CompactCard) => void;
  onOpen: (card: CompactCard, neighbors: CompactCard[]) => void;
}) {
  const rows = stacks(ids);
  const neighbors = rows.map((r) => byId.get(r.id)).filter((c): c is CompactCard => Boolean(c));
  const groups: Record<string, typeof rows> = { Monster: [], Spell: [], Trap: [], Other: [] };
  if (title.startsWith("Extra")) {
    groups.Fusion = [];
    groups.Synchro = [];
    groups.Xyz = [];
    groups.Link = [];
    delete groups.Monster;
    delete groups.Spell;
    delete groups.Trap;
  }
  for (const row of rows) {
    const card = byId.get(row.id);
    const k = card ? cardKind(card) : "other";
    if (title.startsWith("Extra")) {
      const label = k === "fusion" ? "Fusion" : k === "synchro" ? "Synchro" : k === "xyz" ? "Xyz" : k === "link" ? "Link" : "Other";
      (groups[label] ??= []).push(row);
    } else {
      const label = k === "spell" ? "Spell" : k === "trap" ? "Trap" : k === "other" ? "Other" : "Monster";
      groups[label].push(row);
    }
  }

  return (
    <div className="mb-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[11px] text-muted">
          {count} · {cap}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-6 text-center text-xs text-muted">Empty</p>
      ) : (
        Object.entries(groups)
          .filter(([, list]) => list.length)
          .map(([label, list]) => (
            <div key={label} className="mb-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
              <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-9">
                {list.map((row) => {
                  const card = byId.get(row.id);
                  return (
                    <div key={row.id} className="relative">
                      <CardProxy card={card} compact onClick={() => card && onOpen(card, neighbors)} />
                      <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1 text-[10px] font-bold text-zinc-950">
                        {row.count}×
                      </span>
                      <div className="mt-0.5 grid grid-cols-2 gap-0.5">
                        <button type="button" className="rounded bg-bg py-0.5 text-[10px]" onClick={() => onMinus(row.id)}>
                          −
                        </button>
                        <button type="button" className="rounded bg-bg py-0.5 text-[10px]" onClick={() => card && onPlus(card)}>
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
      )}
    </div>
  );
}
