"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DeckPreviewModal } from "@/components/deck/DeckPreview";
import { PREMADE_DECKS, type PremadeDeck } from "@/data/premade-decks";
import { buildPasscodeMap, remapDeck } from "@/lib/cards/passcodes";
import { FORMATS } from "@/lib/deck/formats";
import { materializePremade } from "@/lib/deck/premade";
import type { DeckList } from "@/lib/deck/types";
import { fromYdk } from "@/lib/deck/ydk";
import { readFileAsText } from "@/lib/utils";
import { useCardStore } from "@/store/useCardStore";
import { useDeckStore } from "@/store/useDeckStore";

export default function DecksPage() {
  const router = useRouter();
  const { decks, create, duplicate, remove, ready } = useDeckStore();
  const cards = useCardStore((s) => s.cards);
  const byId = useCardStore((s) => s.byId);
  const [tab, setTab] = useState<"mine" | "tcg" | "md">("mine");
  const [busy, setBusy] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [previewUser, setPreviewUser] = useState<DeckList | null>(null);
  const [previewPremade, setPreviewPremade] = useState<PremadeDeck | null>(null);

  const tcg = useMemo(() => PREMADE_DECKS.filter((d) => d.format === "tcg"), []);
  const md = useMemo(() => PREMADE_DECKS.filter((d) => d.format === "master-duel"), []);

  async function newDeck() {
    const deck = await create({ name: "New Deck" });
    router.push(`/decks/${deck.id}`);
  }

  async function clonePremade(id: string) {
    const premade = PREMADE_DECKS.find((d) => d.id === id);
    if (!premade) return;
    setBusy(id);
    setWarn(null);
    const { deck, missing } = materializePremade(premade, cards);
    const saved = await create(deck);
    setBusy(null);
    setPreviewPremade(null);
    if (missing.length) setWarn(`Imported with ${missing.length} missing names: ${missing.slice(0, 6).join(", ")}`);
    router.push(`/decks/${saved.id}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Decks</h1>
          <p className="text-sm text-muted">Preview any list before you clone or edit it.</p>
        </div>
        <div className="flex gap-2">
          <label className="cursor-pointer rounded-xl border border-line px-3 py-2 text-sm">
            Import .ydk
            <input
              type="file"
              accept=".ydk,text/plain"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const imported = fromYdk(await readFileAsText(file), { name: file.name.replace(/\.ydk$/i, "") });
                const deck = await create(remapDeck(imported, buildPasscodeMap(cards)));
                router.push(`/decks/${deck.id}`);
              }}
            />
          </label>
          <button type="button" onClick={() => void newDeck()} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-zinc-950">
            New deck
          </button>
        </div>
      </div>

      <div className="flex w-fit gap-1 rounded-full bg-bg-elev p-1 text-sm">
        {(
          [
            ["mine", "My decks"],
            ["tcg", "TCG meta"],
            ["md", "Master Duel meta"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-1.5 ${tab === id ? "bg-accent font-semibold text-zinc-950" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {warn && <p className="text-xs text-accent">{warn}</p>}

      {tab === "mine" &&
        (!ready ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : decks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line p-8 text-sm text-muted">
            No decks yet. Preview a meta snapshot, then clone it.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {decks.map((deck) => (
              <article key={deck.id} className="rounded-2xl border border-line bg-bg-elev p-4">
                <h2 className="font-semibold">{deck.name}</h2>
                <p className="text-xs text-muted">
                  {FORMATS[deck.formatId]?.name ?? deck.formatId} · {deck.main.length}/{deck.extra.length}/{deck.side.length}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  <button type="button" className="rounded-lg bg-bg-elev-2 px-3 py-1.5" onClick={() => setPreviewUser(deck)}>
                    View
                  </button>
                  <Link href={`/decks/${deck.id}`} className="rounded-lg bg-accent px-3 py-1.5 font-semibold text-zinc-950">
                    Edit
                  </Link>
                  <Link href={`/play?deck=${deck.id}`} className="rounded-lg bg-bg-elev-2 px-3 py-1.5">
                    Playtest
                  </Link>
                  <button type="button" className="rounded-lg px-3 py-1.5 text-muted" onClick={() => void duplicate(deck.id)}>
                    Duplicate
                  </button>
                  <button type="button" className="rounded-lg px-3 py-1.5 text-danger" onClick={() => void remove(deck.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ))}

      {tab === "tcg" && (
        <PremadeGrid
          title="TCG Advanced — July 2026 snapshot"
          blurb="Preview the full list first. Clone only if you want your own editable copy."
          decks={tcg}
          busy={busy}
          onView={setPreviewPremade}
          onClone={(id) => void clonePremade(id)}
        />
      )}
      {tab === "md" && (
        <PremadeGrid
          title="Master Duel — July 2026 snapshot"
          blurb="Preview before cloning. MD sandbox format — official MD F/L is not fully encoded."
          decks={md}
          busy={busy}
          onView={setPreviewPremade}
          onClone={(id) => void clonePremade(id)}
        />
      )}

      {(previewUser || previewPremade) && (
        <DeckPreviewModal
          userDeck={previewUser}
          premade={previewPremade}
          cards={cards}
          byId={byId}
          cloning={busy === previewPremade?.id}
          onClose={() => {
            setPreviewUser(null);
            setPreviewPremade(null);
          }}
          onEdit={
            previewUser
              ? () => {
                  router.push(`/decks/${previewUser.id}`);
                }
              : undefined
          }
          onClone={previewPremade ? () => void clonePremade(previewPremade.id) : undefined}
        />
      )}
    </div>
  );
}

function PremadeGrid({
  title,
  blurb,
  decks,
  busy,
  onView,
  onClone,
}: {
  title: string;
  blurb: string;
  decks: PremadeDeck[];
  busy: string | null;
  onView: (deck: PremadeDeck) => void;
  onClone: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted">{blurb}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {decks.map((deck) => (
          <article key={deck.id} className="flex flex-col rounded-2xl border border-line bg-bg-elev p-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent">
              {deck.format === "tcg" ? "TCG" : "Master Duel"}
            </div>
            <h3 className="text-lg font-semibold">{deck.name}</h3>
            <p className="mt-1 flex-1 text-sm text-muted">{deck.description}</p>
            <p className="mt-2 text-[11px] text-muted">{deck.archetypes.join(" · ")}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => onView(deck)} className="rounded-xl border border-line px-3 py-2 text-sm">
                View
              </button>
              <button
                type="button"
                disabled={busy === deck.id}
                onClick={() => onClone(deck.id)}
                className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
              >
                {busy === deck.id ? "Cloning…" : "Clone"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
