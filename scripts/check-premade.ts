import { readFileSync } from "node:fs";
import { PREMADE_DECKS } from "../src/data/premade-decks";
import { decodeCardText, isExtraDeckType } from "../src/lib/cards/compact";
import { applyCardLegalityFixes } from "../src/lib/cards/legality";
import type { CompactCard } from "../src/lib/cards/types";
import { FORMATS } from "../src/lib/deck/formats";
import { materializePremade } from "../src/lib/deck/premade";
import { validateDeck } from "../src/lib/deck/validation";
import type { DeckList } from "../src/lib/deck/types";

const cards = (JSON.parse(readFileSync("data/cache/cards.compact.json", "utf8")) as CompactCard[]).map((c) =>
  applyCardLegalityFixes({
    ...c,
    name: decodeCardText(c.name),
    desc: decodeCardText(c.desc ?? ""),
  }),
);
const byName = new Map(cards.map((c) => [c.name.toLowerCase(), c]));
const byId = new Map(cards.map((c) => [c.id, c]));

let failures = 0;

function fail(msg: string) {
  failures += 1;
  console.error(msg);
}

for (const deck of PREMADE_DECKS) {
  const format = deck.format === "master-duel" ? FORMATS["master-duel"] : FORMATS.advanced;
  const used = new Map<string, { n: number; card: CompactCard }>();

  for (const [zone, list] of [
    ["main", deck.main],
    ["extra", deck.extra],
    ["side", deck.side ?? []],
  ] as const) {
    for (const entry of list) {
      if (entry.count < 1) continue;
      const card = byName.get(entry.name.toLowerCase());
      if (!card) {
        fail(`${deck.id} MISSING ${zone}: ${entry.name}`);
        continue;
      }
      const ed = isExtraDeckType(card.type);
      if (zone === "main" && ed) fail(`${deck.id} MAIN has Extra Deck type (${card.type}): ${card.name}`);
      if (zone === "extra" && !ed) fail(`${deck.id} EXTRA has non-ED type (${card.type}): ${card.name}`);
      if (deck.format === "tcg" && format.cardFilter && !format.cardFilter(card)) {
        fail(`${deck.id} outside TCG pool: ${card.name}`);
      }
      const key = (card.treatedAs ?? card.name).toLowerCase();
      const prev = used.get(key);
      used.set(key, { n: (prev?.n ?? 0) + entry.count, card });
    }
  }

  if (deck.format === "tcg" || deck.format === "master-duel") {
    for (const { n, card } of used.values()) {
      const max = format.copiesFor(card);
      if (n > max) {
        const tag = deck.format === "tcg" ? `TCG${card.banTcg ? `, ${card.banTcg}` : ""}` : `MD${card.banMd ? `, ${card.banMd}` : ""}`;
        fail(`${deck.id} ${card.name} is ${n}-of (${tag} max ${max})`);
      }
    }
  }

  const { deck: mat, missing } = materializePremade(deck, cards);
  for (const name of missing) fail(`${deck.id} materialize missing: ${name}`);
  const fake: DeckList = {
    id: deck.id,
    createdAt: "",
    updatedAt: "",
    name: mat.name,
    formatId: mat.formatId,
    notes: mat.notes,
    main: mat.main,
    extra: mat.extra,
    side: mat.side,
  };
  for (const issue of validateDeck(fake, byId)) {
    if (issue.level === "error") fail(`${deck.id} ${issue.message}`);
  }
  if (mat.extra.length > 15) fail(`${deck.id} materialized extra ${mat.extra.length}/15`);
}

if (failures) {
  console.error(`\n${failures} premade audit failure(s)`);
  process.exit(1);
}
console.log(`ok — ${PREMADE_DECKS.length} premade decks (names, Extra Deck zones, TCG copies)`);
