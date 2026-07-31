"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCardViewer } from "@/components/cards/CardViewer";
import { CardProxy } from "@/components/cards/CardProxy";
import { BuildAround } from "@/components/deck/BuildAround";
import { TypeTabs } from "@/components/deck/TypeTabs";
import { cardKind, isExtraKind, kindLabel, type CardKind } from "@/lib/cards/kinds";
import { buildPasscodeMap, remapDeck } from "@/lib/cards/passcodes";
import { searchCards } from "@/lib/cards/search";
import type { CompactCard } from "@/lib/cards/types";
import { FORMAT_LIST } from "@/lib/deck/formats";
import { suggestedSection, validateDeck, deckStats } from "@/lib/deck/validation";
import type { DeckList } from "@/lib/deck/types";
import { fromYdk, toYdk } from "@/lib/deck/ydk";
import { cn, downloadText, readFileAsText } from "@/lib/utils";
import { useCardStore } from "@/store/useCardStore";
import { useDeckStore } from "@/store/useDeckStore";

type Section = "main" | "extra" | "side";

type Stack = {
  id: number;
  card?: CompactCard;
  count: number;
  section: Section;
};

const DECK_ORDER: CardKind[] = ["monster", "ritual", "spell", "trap", "fusion", "synchro", "xyz", "link", "other"];

function stackIds(ids: number[], byId: Map<number, CompactCard>, section: Section): Stack[] {
  const order: number[] = [];
  const map = new Map<number, Stack>();
  for (const id of ids) {
    const cur = map.get(id);
    if (cur) cur.count += 1;
    else {
      map.set(id, { id, card: byId.get(id), count: 1, section });
      order.push(id);
    }
  }
  return order.map((id) => map.get(id)!);
}

export function DeckEditor({ initial }: { initial: DeckList }) {
  const router = useRouter();
  const cards = useCardStore((s) => s.cards);
  const byId = useCardStore((s) => s.byId);
  const synergy = useCardStore((s) => s.synergy);
  const save = useDeckStore((s) => s.save);
  const remove = useDeckStore((s) => s.remove);
  const { openCard } = useCardViewer();

  const [deck, setDeck] = useState(initial);
  const [search, setSearch] = useState("");
  const [findKind, setFindKind] = useState<CardKind | "all">("monster");
  const [selected, setSelected] = useState<CompactCard | null>(null);
  const [seed, setSeed] = useState<CompactCard | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [deckKind, setDeckKind] = useState<CardKind | "all">("all");

  const results = useMemo(
    () => searchCards(cards, { text: search, kind: findKind }, 80),
    [cards, search, findKind],
  );
  const stats = useMemo(() => deckStats(deck, byId), [deck, byId]);
  const issues = useMemo(() => validateDeck(deck, byId), [deck, byId]);
  const deckIds = useMemo(() => [...deck.main, ...deck.extra, ...deck.side], [deck]);

  const findCounts = useMemo(() => {
    const c: Partial<Record<CardKind | "all", number>> = {};
    if (!search.trim()) return c;
    const matched = searchCards(cards, { text: search }, 400);
    c.all = matched.length;
    for (const card of matched) {
      const k = cardKind(card);
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [cards, search]);

  function update(partial: Partial<DeckList>) {
    setDeck((d) => ({ ...d, ...partial }));
  }

  function addCard(card: CompactCard, section?: Section, copies = 1) {
    const dest = section ?? (suggestedSection(card) === "extra" || isExtraKind(cardKind(card)) ? "extra" : "main");
    update({ [dest]: [...deck[dest], ...Array.from({ length: copies }, () => card.id)] });
    setSelected(card);
    setSeed((current) => current ?? card);
  }

  function removeOne(section: Section, id: number) {
    const list = [...deck[section]];
    const idx = list.lastIndexOf(id);
    if (idx < 0) return;
    list.splice(idx, 1);
    update({ [section]: list });
  }

  function removeAll(section: Section, id: number) {
    update({ [section]: deck[section].filter((x) => x !== id) });
  }

  async function persist() {
    const normalized = remapDeck(deck, buildPasscodeMap(cards));
    setDeck(normalized);
    await save(normalized);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  }

  function inspect(card: CompactCard, asSeed = false, neighbors?: CompactCard[]) {
    setSelected(card);
    if (asSeed) setSeed(card);
    openCard(card, {
      neighbors,
      onAdd: (c) => addCard(c),
      onUse: (c) => {
        setSelected(c);
        setSeed(c);
      },
    });
  }

  const allStacks = useMemo(
    () => [
      ...stackIds(deck.main, byId, "main"),
      ...stackIds(deck.extra, byId, "extra"),
      ...stackIds(deck.side, byId, "side"),
    ],
    [deck.main, deck.extra, deck.side, byId],
  );

  const deckKindCounts = useMemo(() => {
    const c: Partial<Record<CardKind | "all", number>> = { all: allStacks.reduce((n, s) => n + s.count, 0) };
    for (const stack of allStacks) {
      const k = stack.card ? cardKind(stack.card) : "other";
      c[k] = (c[k] ?? 0) + stack.count;
    }
    return c;
  }, [allStacks]);

  const visibleGroups = useMemo(() => {
    const filtered =
      deckKind === "all" ? allStacks : allStacks.filter((s) => (s.card ? cardKind(s.card) : "other") === deckKind);
    const groups = new Map<CardKind, Stack[]>();
    for (const kind of DECK_ORDER) groups.set(kind, []);
    for (const stack of filtered) {
      const kind = stack.card ? cardKind(stack.card) : "other";
      const key = groups.has(kind) ? kind : "other";
      groups.get(key)!.push(stack);
    }
    return DECK_ORDER.map((kind) => ({ kind, stacks: groups.get(kind) ?? [] })).filter((g) => g.stacks.length > 0);
  }, [allStacks, deckKind]);

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-bg-elev px-3 py-2">
        <input
          value={deck.name}
          onChange={(e) => update({ name: e.target.value })}
          className="min-w-40 flex-1 rounded-xl border border-line bg-bg px-3 py-2 text-sm font-semibold"
        />
        <select
          value={deck.formatId}
          onChange={(e) => update({ formatId: e.target.value as DeckList["formatId"] })}
          className="rounded-xl border border-line bg-bg px-2 py-2 text-sm"
        >
          {FORMAT_LIST.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2 font-mono text-xs">
          <span className={cn(stats.main < 40 || stats.main > 60 ? "text-danger" : "text-ok")}>{stats.main}</span>
          <span className="text-muted">/</span>
          <span>{stats.extra}</span>
          <span className="text-muted">/</span>
          <span>{stats.side}</span>
          <span className="text-muted">main/ed/side</span>
        </div>
        <button
          type="button"
          onClick={() => void persist()}
          className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-zinc-950"
        >
          {savedFlash ? "Saved" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => downloadText(`${deck.name.replace(/\s+/g, "_")}.ydk`, toYdk(deck))}
          className="rounded-xl border border-line px-3 py-2 text-sm"
        >
          Export
        </button>
        <label className="cursor-pointer rounded-xl border border-line px-3 py-2 text-sm">
          Import
          <input
            type="file"
            accept=".ydk,text/plain"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await readFileAsText(file);
              const imported = fromYdk(text, {
                name: file.name.replace(/\.ydk$/i, ""),
                formatId: deck.formatId,
              });
              setDeck(remapDeck({ ...imported, id: deck.id, notes: deck.notes }, buildPasscodeMap(cards)));
            }}
          />
        </label>
        <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm" onClick={() => setShowNotes((v) => !v)}>
          Notes
        </button>
        <button
          type="button"
          className="rounded-xl border border-danger/40 px-3 py-2 text-sm text-danger"
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
        <div className="flex flex-wrap gap-2 text-[11px]">
          {issues.slice(0, 6).map((issue) => (
            <span
              key={issue.message}
              className={cn(
                "rounded-full px-2 py-1",
                issue.level === "error" ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent",
              )}
            >
              {issue.message}
            </span>
          ))}
        </div>
      )}

      {showNotes && (
        <textarea
          value={deck.notes}
          onChange={(e) => update({ notes: e.target.value })}
          rows={3}
          placeholder="Lab notes — combos, bricks, side plan…"
          className="w-full rounded-2xl border border-line bg-bg-elev px-3 py-2 text-sm"
        />
      )}

      <div className="grid gap-3 xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)_minmax(280px,340px)]">
        <section className="rounded-2xl border border-line bg-bg-elev/90 p-3">
          <h2 className="text-sm font-semibold">Find cards</h2>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search any card…"
            className="mt-2 w-full rounded-xl border border-line bg-bg px-3 py-2 text-sm"
          />
          <div className="mt-2">
            <TypeTabs value={findKind} onChange={setFindKind} counts={search.trim() ? findCounts : undefined} compact />
          </div>
          <div className="mt-3 grid max-h-[68vh] grid-cols-2 gap-2 overflow-auto pr-1 sm:grid-cols-3">
            {results.map((card) => (
              <div key={card.id} className="group">
                <CardProxy
                  card={card}
                  compact
                  selected={selected?.id === card.id || seed?.id === card.id}
                  onClick={() => inspect(card, false, results)}
                />
                <div className="mt-1 grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    className="rounded-md bg-accent py-1 text-[10px] font-semibold text-zinc-950"
                    onClick={() => addCard(card)}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-bg-elev-2 py-1 text-[10px] text-muted hover:text-text"
                    onClick={() => inspect(card, true, results)}
                  >
                    Use
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!search && findKind === "all" && (
            <p className="mt-3 text-center text-[11px] text-muted">Pick a type tab or type a name to start.</p>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-bg-elev/90 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Your deck</h2>
            <div className="text-[11px] text-muted">
              Main {stats.main} · Extra {stats.extra} · Side {stats.side}
            </div>
          </div>
          <TypeTabs
            value={deckKind}
            onChange={setDeckKind}
            counts={deckKindCounts}
            compact
            allLabel="Deck"
            allShort="Deck"
          />

          <div className="mt-3">
            <DeckGroups
              groups={visibleGroups}
              selectedId={selected?.id}
              emptyLabel={
                deckKind === "all"
                  ? "Your deck is empty. Add cards from Find or Works with."
                  : `No ${kindLabel(deckKind).toLowerCase()} in this deck yet.`
              }
              onSelect={(card) =>
                inspect(
                  card,
                  true,
                  visibleGroups.flatMap((g) => g.stacks.map((s) => s.card).filter((c): c is CompactCard => Boolean(c))),
                )
              }
              onAdd={(card, section) => addCard(card, section)}
              onRemoveOne={(section, id) => removeOne(section, id)}
              onRemoveAll={(section, id) => removeAll(section, id)}
            />
          </div>
        </section>

        <div className="space-y-3">
          <BuildAround
            seed={seed}
            index={synergy}
            allCards={cards}
            deckIds={deckIds}
            onSeedChange={(card) => {
              setSeed(card);
              setSelected(card);
            }}
            onAdd={(card, copies) => addCard(card, undefined, copies ?? 1)}
            onInspect={(card, neighbors) => inspect(card, false, neighbors)}
          />
        </div>
      </div>
    </div>
  );
}

function DeckGroups({
  groups,
  selectedId,
  emptyLabel,
  onSelect,
  onAdd,
  onRemoveOne,
  onRemoveAll,
}: {
  groups: Array<{ kind: CardKind; stacks: Stack[] }>;
  selectedId?: number;
  emptyLabel: string;
  onSelect: (card: CompactCard) => void;
  onAdd: (card: CompactCard, section: Section) => void;
  onRemoveOne: (section: Section, id: number) => void;
  onRemoveAll: (section: Section, id: number) => void;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line py-12 text-center text-sm text-muted">
        {emptyLabel}
      </div>
    );
  }

  const showHeaders = groups.length > 1;

  return (
    <div className="max-h-[72vh] space-y-4 overflow-auto pr-1">
      {groups.map((group) => (
        <div key={group.kind}>
          {showHeaders && (
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                {kindLabel(group.kind)}
              </h3>
              <span className="text-[11px] text-muted">
                {group.stacks.reduce((n, s) => n + s.count, 0)} cards · {group.stacks.length} names
              </span>
            </div>
          )}
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7">
            {group.stacks.map((stack) => (
              <div key={`${stack.section}-${stack.id}`} className="rounded-xl bg-bg/60 p-1">
                <div className="relative">
                  <CardProxy
                    card={stack.card}
                    compact
                    selected={selectedId === stack.id}
                    onClick={() => stack.card && onSelect(stack.card)}
                  />
                  <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-zinc-950">
                    {stack.count}×
                  </span>
                  {stack.section !== "main" && (
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[9px] uppercase text-white/80">
                      {stack.section === "extra" ? "ED" : "Side"}
                    </span>
                  )}
                </div>
                <div className="mt-1 grid grid-cols-3 gap-0.5 text-[11px]">
                  <button
                    type="button"
                    className="rounded bg-bg-elev-2 py-0.5 hover:bg-danger/30"
                    onClick={() => onRemoveOne(stack.section, stack.id)}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="rounded bg-bg-elev-2 py-0.5 hover:bg-accent/40"
                    onClick={() => stack.card && onAdd(stack.card, stack.section)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="rounded bg-bg-elev-2 py-0.5 text-muted hover:text-danger"
                    onClick={() => onRemoveAll(stack.section, stack.id)}
                    title="Remove all copies"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
