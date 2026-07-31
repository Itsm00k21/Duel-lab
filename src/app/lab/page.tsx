"use client";

import { useMemo, useState } from "react";
import { CardProxy } from "@/components/cards/CardProxy";
import { searchCards } from "@/lib/cards/search";
import { useCardStore } from "@/store/useCardStore";
import { useDeckStore } from "@/store/useDeckStore";

export default function LabPage() {
  const cards = useCardStore((s) => s.cards);
  const byId = useCardStore((s) => s.byId);
  const decks = useDeckStore((s) => s.decks);
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [puzzle, setPuzzle] = useState("");
  const [handText, setHandText] = useState("");

  const deckA = decks.find((d) => d.id === a);
  const deckB = decks.find((d) => d.id === b);

  const diff = useMemo(() => {
    if (!deckA || !deckB) return null;
    function count(ids: number[]) {
      const m = new Map<number, number>();
      for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
      return m;
    }
    const ca = count([...deckA.main, ...deckA.extra, ...deckA.side]);
    const cb = count([...deckB.main, ...deckB.extra, ...deckB.side]);
    const ids = new Set([...ca.keys(), ...cb.keys()]);
    const rows: Array<{ id: number; left: number; right: number }> = [];
    for (const id of ids) {
      const left = ca.get(id) ?? 0;
      const right = cb.get(id) ?? 0;
      if (left !== right) rows.push({ id, left, right });
    }
    return rows.sort((x, y) => (byId.get(x.id)?.name ?? "").localeCompare(byId.get(y.id)?.name ?? ""));
  }, [deckA, deckB, byId]);

  const puzzleCards = useMemo(() => {
    return handText
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean)
      .flatMap((name) => searchCards(cards, { text: name }, 1));
  }, [handText, cards]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Lab</h1>
        <p className="text-sm text-muted">
          Deck diff and combo sandbox. Auto-solver / coach overlay can hook in later — for now this is
          a thinking table.
        </p>
      </div>

      <section className="rounded-xl border border-line bg-bg-elev p-4">
        <h2 className="font-semibold">Deck diff</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <select value={a} onChange={(e) => setA(e.target.value)} className="rounded-lg border border-line bg-bg px-3 py-2 text-sm">
            <option value="">Left deck</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select value={b} onChange={(e) => setB(e.target.value)} className="rounded-lg border border-line bg-bg px-3 py-2 text-sm">
            <option value="">Right deck</option>
            {decks.map((d) => (
              <option key={`b-${d.id}`} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        {diff && (
          <table className="mt-4 w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1">Card</th>
                <th>Left</th>
                <th>Right</th>
              </tr>
            </thead>
            <tbody>
              {diff.map((row) => (
                <tr key={row.id} className="border-t border-line/60">
                  <td className="py-1">{byId.get(row.id)?.name ?? row.id}</td>
                  <td>{row.left}</td>
                  <td>{row.right}</td>
                </tr>
              ))}
              {diff.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-3 text-muted">
                    Lists are identical.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-line bg-bg-elev p-4 space-y-2 text-sm">
        <h2 className="font-semibold">Rules cheat sheet</h2>
        <p className="text-xs text-muted">
          From Konami Fast Effect Timing + Yugipedia Chain / SEGOC / PSCT. Helper only — not a judge.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>
            <strong className="text-text">SS1</strong> — Normal/Equip/Field/Ritual/Continuous Spells, Ignition, Trigger, Flip.
            Cannot respond except via SEGOC.
          </li>
          <li>
            <strong className="text-text">SS2</strong> — Quick-Play Spells, Normal/Continuous Traps, Quick Effects. Can respond to SS1/SS2.
          </li>
          <li>
            <strong className="text-text">SS3</strong> — Counter Traps only. Only SS3 can chain to SS3.
          </li>
          <li>
            <strong className="text-text">SEGOC (TCG)</strong> — TP mandatory → NTP mandatory → TP optional → NTP optional, then fast effects.
          </li>
          <li>
            <strong className="text-text">PSCT</strong> — before <code>:</code> timing; before <code>;</code> cost/target; after is resolution.
            “When” can miss timing; “If” generally cannot.
          </li>
          <li>
            <strong className="text-text">Open game state</strong> — FET Box A: NS/Set/inherent SS/position change/SS1/attack declaration.
          </li>
          <li>After a Chain resolves, check triggers (yellow box) before the game state opens again.</li>
        </ul>
      </section>

      <section className="rounded-xl border border-line bg-bg-elev p-4">
        <h2 className="font-semibold">Combo / puzzle opener</h2>
        <p className="text-xs text-muted">Paste card names (one per line). Use this as a mental combo lab.</p>
        <textarea
          value={handText}
          onChange={(e) => setHandText(e.target.value)}
          rows={5}
          className="mt-2 w-full rounded-lg border border-line bg-bg p-2 text-sm"
          placeholder={"Ash Blossom & Joyous Spring\nInfinite Impermanence\n..."}
        />
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
          {puzzleCards.map((card) => (
            <CardProxy key={`${card.id}-${card.name}`} card={card} compact />
          ))}
        </div>
        <textarea
          value={puzzle}
          onChange={(e) => setPuzzle(e.target.value)}
          rows={4}
          className="mt-3 w-full rounded-lg border border-line bg-bg p-2 text-sm"
          placeholder="Notes: can I OTK through Nibiru? What's the one-card line?"
        />
      </section>
    </div>
  );
}
