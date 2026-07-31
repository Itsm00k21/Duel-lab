"use client";

import { useState } from "react";
import { db } from "@/lib/db/dexie";
import { useCardStore } from "@/store/useCardStore";

export default function SettingsPage() {
  const { meta, cards, syncing, error, syncRemote } = useCardStore();
  const [prefetch, setPrefetch] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const withArt = cards.filter((c) => c.imageId).length;

  async function prefetchAll() {
    setBusy(true);
    setPrefetch("Starting…");
    let remaining = 1;
    let totalOk = 0;
    let totalFail = 0;
    try {
      while (remaining > 0) {
        const res = await fetch("/api/cards/images/prefetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ size: "small", limit: 200 }),
        });
        const json = await res.json();
        totalOk += json.ok ?? 0;
        totalFail += json.failed ?? 0;
        remaining = json.remaining ?? 0;
        setPrefetch(`Cached ${totalOk} · failed ${totalFail} · remaining ${remaining}`);
        if (!json.attempted) break;
      }
    } catch (e) {
      setPrefetch(e instanceof Error ? e.message : "Prefetch failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted">Local data only. Nothing is uploaded.</p>
      </div>

      <section className="space-y-3 rounded-xl border border-line bg-bg-elev p-4">
        <h2 className="font-semibold">Card database</h2>
        <p className="text-sm text-muted">
          {meta
            ? `${cards.length.toLocaleString()} cards cached · API v${meta.version} · updated ${meta.lastUpdate}`
            : "No local cache yet."}
        </p>
        {meta && (
          <p className="text-xs text-muted">
            Art links: {withArt.toLocaleString()} cards · exact {meta.imageExact?.toLocaleString() ?? "?"} · listed-alt{" "}
            {meta.imageAlt?.toLocaleString() ?? "?"} · passcode fallback {meta.imageFallback?.toLocaleString() ?? "?"}
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncRemote(true)}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-50"
        >
          {syncing ? "Syncing… this can take a minute" : "Force re-sync from YGOPRODeck"}
        </button>
        <p className="text-xs text-muted">
          Re-sync rebuilds card data and the passcode → artwork cross-reference. Images are downloaded locally on first
          view (YGOPRODeck requires re-hosting, not hotlinking).
        </p>
      </section>

      <section className="space-y-3 rounded-xl border border-line bg-bg-elev p-4">
        <h2 className="font-semibold">Card art cache</h2>
        <p className="text-sm text-muted">
          Optional: download small card images now so playtest is instant offline. This can take several minutes.
        </p>
        <button
          type="button"
          disabled={busy || syncing}
          onClick={() => void prefetchAll()}
          className="rounded-lg border border-line px-3 py-2 text-sm"
        >
          {busy ? "Downloading art…" : "Prefetch all small card art"}
        </button>
        {prefetch && <p className="text-xs text-muted">{prefetch}</p>}
      </section>

      <section className="space-y-3 rounded-xl border border-line bg-bg-elev p-4">
        <h2 className="font-semibold">Danger zone</h2>
        <button
          type="button"
          className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger"
          onClick={async () => {
            if (!confirm("Clear ALL local decks, sessions, and card cache?")) return;
            await db.delete();
            location.reload();
          }}
        >
          Wipe local database
        </button>
      </section>

      <section className="space-y-2 rounded-xl border border-dashed border-line p-4 text-sm text-muted">
        <h2 className="font-semibold text-text">Legal / scope</h2>
        <p>
          Unofficial private playtest tool. Not affiliated with Konami Digital Entertainment, NAS, or Shueisha. Card
          images are cached locally from the community YGOPRODeck CDN for testing only. Do not redistribute or monetize.
        </p>
      </section>
    </div>
  );
}
