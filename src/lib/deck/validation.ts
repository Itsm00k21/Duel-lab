import { isExtraDeckType, isSpellOrTrap } from "@/lib/cards/compact";
import type { CompactCard } from "@/lib/cards/types";
import { FORMATS } from "./formats";
import type { DeckIssue, DeckList, DeckStats } from "./types";

function counts(ids: number[]) {
  const map = new Map<number, number>();
  for (const id of ids) map.set(id, (map.get(id) ?? 0) + 1);
  return map;
}

export function deckStats(
  deck: Pick<DeckList, "main" | "extra" | "side">,
  cards: Map<number, CompactCard>,
): DeckStats {
  let monsters = 0;
  let spells = 0;
  let traps = 0;
  let genesysPoints = 0;

  for (const id of deck.main) {
    const card = cards.get(id);
    if (!card) continue;
    const t = card.type.toLowerCase();
    if (t.includes("spell")) spells += 1;
    else if (t.includes("trap")) traps += 1;
    else monsters += 1;
    genesysPoints += card.genesys ?? 0;
  }
  for (const id of [...deck.extra, ...deck.side]) {
    genesysPoints += cards.get(id)?.genesys ?? 0;
  }

  return {
    main: deck.main.length,
    extra: deck.extra.length,
    side: deck.side.length,
    monsters,
    spells,
    traps,
    genesysPoints,
  };
}

export function validateDeck(deck: DeckList, cards: Map<number, CompactCard>): DeckIssue[] {
  const format = FORMATS[deck.formatId];
  const issues: DeckIssue[] = [];
  const stats = deckStats(deck, cards);

  if (stats.main < 40) issues.push({ level: "error", message: `Main Deck is ${stats.main}/40 minimum.` });
  if (stats.main > 60) issues.push({ level: "error", message: `Main Deck is ${stats.main}/60 maximum.` });
  if (stats.extra > 15) issues.push({ level: "error", message: `Extra Deck is ${stats.extra}/15 maximum.` });
  if (stats.side > 15) issues.push({ level: "error", message: `Side Deck is ${stats.side}/15 maximum.` });

  if (format.genesysBudget !== undefined && stats.genesysPoints > format.genesysBudget) {
    issues.push({
      level: "error",
      message: `Genesys points ${stats.genesysPoints} exceed budget ${format.genesysBudget}.`,
    });
  }

  const all = [...deck.main, ...deck.extra, ...deck.side];
  const byId = counts(all);

  for (const [id, n] of byId) {
    const card = cards.get(id);
    if (!card) {
      issues.push({ level: "warn", message: `Unknown card id ${id} ×${n}. Sync the card DB.` });
      continue;
    }

    if (format.cardFilter && !format.cardFilter(card)) {
      issues.push({ level: "warn", message: `${card.name} is outside ${format.name} card pool.` });
    }

    const max = format.copiesFor(card);
    const nameKey = (card.treatedAs ?? card.name).toLowerCase();
    // Count treated-as names together
    let treatedTotal = 0;
    for (const [otherId, count] of byId) {
      const other = cards.get(otherId);
      if (!other) continue;
      if ((other.treatedAs ?? other.name).toLowerCase() === nameKey) treatedTotal += count;
    }
    if (treatedTotal > max) {
      issues.push({
        level: "error",
        message: `${card.treatedAs ?? card.name} is ${treatedTotal}-of (max ${max} in ${format.name}).`,
      });
    }

    const extraErr = format.validateExtra?.(card);
    if (extraErr && deck.extra.includes(id)) {
      issues.push({ level: "error", message: `${card.name}: ${extraErr}` });
    }
  }

  for (const id of deck.main) {
    const card = cards.get(id);
    if (!card) continue;
    if (isExtraDeckType(card.type)) {
      issues.push({
        level: "error",
        message: `${card.name} belongs in the Extra Deck.`,
      });
    }
  }

  for (const id of deck.extra) {
    const card = cards.get(id);
    if (!card) continue;
    if (!isExtraDeckType(card.type)) {
      issues.push({
        level: "warn",
        message: `${card.name} is not an Extra Deck monster (Fusion/Synchro/Xyz/Link).`,
      });
    }
  }

  // de-dupe identical messages
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.level}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function suggestedSection(card: CompactCard): "main" | "extra" {
  if (isExtraDeckType(card.type)) return "extra";
  return "main";
}

export function typeBucket(card: CompactCard): "monster" | "spell" | "trap" {
  if (isSpellOrTrap(card.type)) {
    return card.type.toLowerCase().includes("trap") ? "trap" : "spell";
  }
  return "monster";
}
