import type { CompactCard } from "@/lib/cards/types";
import { isExtraDeckType, isSpellOrTrap } from "@/lib/cards/compact";
import { extractQuotes, inferRoles, parseCard, type CardRole } from "@/lib/rules/psct";
import { stapleRoles } from "./staples";

export type Mention = {
  quote: string;
  kind: "card" | "archetype" | "unknown";
  cardId?: number;
  archetype?: string;
};

export type SynergyCategory =
  | "names-you"
  | "you-name"
  | "archetype"
  | "name-family"
  | "extra-piece"
  | "searcher"
  | "spell-trap-support"
  | "related";

export type SynergyHit = {
  card: CompactCard;
  reasons: string[];
  score: number;
  categories: SynergyCategory[];
};

export type SynergyIndex = {
  byName: Map<string, CompactCard>;
  byId: Map<number, CompactCard>;
  archetypes: Map<string, CompactCard[]>;
  mentions: Map<number, Mention[]>;
  mentionedByCard: Map<number, Set<number>>;
  mentionedByArchetype: Map<string, Set<number>>;
  nameNorm: Map<number, string>;
  descNorm: Map<number, string>;
  all: CompactCard[];
};

function norm(s: string) {
  return s.toLowerCase().replace(/['’]/g, "'").trim();
}

export function buildSynergyIndex(cards: CompactCard[]): SynergyIndex {
  const byName = new Map<string, CompactCard>();
  const byId = new Map<number, CompactCard>();
  const archetypes = new Map<string, CompactCard[]>();
  const nameNorm = new Map<number, string>();
  const descNorm = new Map<number, string>();

  for (const card of cards) {
    byId.set(card.id, card);
    byName.set(norm(card.name), card);
    if (card.treatedAs) byName.set(norm(card.treatedAs), card);
    nameNorm.set(card.id, norm(card.name));
    descNorm.set(card.id, norm(card.desc));
    if (card.archetype) {
      const key = norm(card.archetype);
      const list = archetypes.get(key) ?? [];
      list.push(card);
      archetypes.set(key, list);
    }
  }

  const mentions = new Map<number, Mention[]>();
  const mentionedByCard = new Map<number, Set<number>>();
  const mentionedByArchetype = new Map<string, Set<number>>();

  for (const card of cards) {
    const quotes = extractQuotes(card.desc);
    const list: Mention[] = [];
    for (const quote of quotes) {
      const q = norm(quote);
      if (q === norm(card.name)) continue;
      const named = byName.get(q);
      if (named) {
        list.push({ quote, kind: "card", cardId: named.id });
        const set = mentionedByCard.get(named.id) ?? new Set();
        set.add(card.id);
        mentionedByCard.set(named.id, set);
        continue;
      }
      const arch = archetypes.get(q);
      if (arch?.length) {
        list.push({ quote, kind: "archetype", archetype: quote });
        const set = mentionedByArchetype.get(q) ?? new Set();
        set.add(card.id);
        mentionedByArchetype.set(q, set);
        continue;
      }
      const archHit = [...archetypes.keys()].find(
        (a) => a.length >= 4 && (q === a || q.startsWith(`${a} `) || q.includes(` ${a} `) || q.endsWith(` ${a}`)),
      );
      if (archHit) {
        list.push({ quote, kind: "archetype", archetype: archetypes.get(archHit)?.[0]?.archetype ?? quote });
        const set = mentionedByArchetype.get(archHit) ?? new Set();
        set.add(card.id);
        mentionedByArchetype.set(archHit, set);
        continue;
      }
      list.push({ quote, kind: "unknown" });
    }
    mentions.set(card.id, list);
  }

  return {
    byName,
    byId,
    archetypes,
    mentions,
    mentionedByCard,
    mentionedByArchetype,
    nameNorm,
    descNorm,
    all: cards,
  };
}

export function cardRoles(card: CompactCard): Array<CardRole | string> {
  return [...new Set([...inferRoles(card, parseCard(card)), ...stapleRoles(card.name)])];
}

function addHit(
  scores: Map<number, { card: CompactCard; reasons: Set<string>; score: number; categories: Set<SynergyCategory> }>,
  target: CompactCard,
  selfId: number,
  reason: string,
  score: number,
  category: SynergyCategory,
  allow?: Set<number>,
) {
  if (target.id === selfId) return;
  if (allow && !allow.has(target.id)) return;
  const cur =
    scores.get(target.id) ??
    ({ card: target, reasons: new Set<string>(), score: 0, categories: new Set<SynergyCategory>() });
  cur.reasons.add(reason);
  cur.categories.add(category);
  cur.score += score;
  scores.set(target.id, cur);
}

export function synergiesFor(
  card: CompactCard,
  index: SynergyIndex,
  opts?: { pool?: CompactCard[]; limit?: number },
): SynergyHit[] {
  return buildAround(card, index, opts);
}

export function buildAround(
  card: CompactCard,
  index: SynergyIndex,
  opts?: { pool?: CompactCard[]; limit?: number },
): SynergyHit[] {
  const pool = opts?.pool ?? index.all;
  const allow = opts?.pool ? new Set(pool.map((c) => c.id)) : undefined;
  const scores = new Map<
    number,
    { card: CompactCard; reasons: Set<string>; score: number; categories: Set<SynergyCategory> }
  >();
  const add = (
    target: CompactCard,
    reason: string,
    score: number,
    category: SynergyCategory,
  ) => addHit(scores, target, card.id, reason, score, category, allow);

  const seedName = index.nameNorm.get(card.id) ?? norm(card.name);
  const seedArch = card.archetype ? norm(card.archetype) : "";
  const treated = card.treatedAs ? norm(card.treatedAs) : "";

  if (seedArch) {
    for (const other of index.archetypes.get(seedArch) ?? []) {
      add(other, `Same archetype: ${card.archetype}`, 8, "archetype");
    }
  }

  for (const mention of index.mentions.get(card.id) ?? []) {
    if (mention.kind === "card" && mention.cardId != null) {
      const target = index.byId.get(mention.cardId);
      if (target) add(target, `Your text names "${mention.quote}"`, 14, "you-name");
    }
    if (mention.kind === "archetype" && mention.archetype) {
      for (const other of index.archetypes.get(norm(mention.archetype)) ?? []) {
        add(other, `Your text supports "${mention.quote}"`, 7, "you-name");
      }
    }
  }

  for (const sourceId of index.mentionedByCard.get(card.id) ?? []) {
    const source = index.byId.get(sourceId);
    if (source) add(source, `Names "${card.name}"`, 16, "names-you");
  }

  if (seedArch) {
    for (const sourceId of index.mentionedByArchetype.get(seedArch) ?? []) {
      const source = index.byId.get(sourceId);
      if (source) add(source, `Names archetype "${card.archetype}"`, 12, "names-you");
    }
  }

  // Full scan: unquoted name / archetype in text, name-family, ED materials.
  for (const other of index.all) {
    if (other.id === card.id) continue;
    if (allow && !allow.has(other.id)) continue;
    const otherName = index.nameNorm.get(other.id) ?? norm(other.name);
    const desc = index.descNorm.get(other.id) ?? "";
    const otherArch = other.archetype ? norm(other.archetype) : "";

    if (seedName.length >= 5 && otherName.includes(seedName) && otherName !== seedName) {
      add(other, `Name family of "${card.name}"`, 11, "name-family");
    }
    if (seedArch.length >= 5 && otherName.includes(seedArch) && otherArch !== seedArch) {
      add(other, `Name includes "${card.archetype}"`, 6, "name-family");
    }

    if (seedName.length >= 5 && desc.includes(seedName) && otherName !== seedName) {
      add(other, `Mentions "${card.name}" in effect text`, 15, "names-you");
    }
    if (treated.length >= 5 && desc.includes(treated)) {
      add(other, `Mentions "${card.treatedAs}"`, 12, "names-you");
    }
    if (seedArch.length >= 6 && (desc.includes(`"${seedArch}"`) || desc.includes(seedArch)) && otherArch !== seedArch) {
      add(other, `Mentions archetype "${card.archetype}"`, 10, "names-you");
    }

    const selfDesc = index.descNorm.get(card.id) ?? "";
    if (otherName.length >= 6 && selfDesc.includes(otherName)) {
      add(other, `"${card.name}" text includes "${other.name}"`, 9, "you-name");
    }

    if (isExtraDeckType(other.type) && seedName.length >= 5 && desc.includes(seedName)) {
      add(other, `Extra Deck piece that uses "${card.name}"`, 13, "extra-piece");
    }

    const roles = cardRoles(other);
    if (
      roles.includes("searcher") &&
      (otherArch === seedArch || desc.includes(seedName) || desc.includes(seedArch))
    ) {
      add(other, "Searcher / consistency for this engine", 5, "searcher");
    }

    if (
      isSpellOrTrap(other.type) &&
      (desc.includes(seedName) || (seedArch && desc.includes(seedArch)) || otherArch === seedArch)
    ) {
      add(other, "Spell/Trap support", 4, "spell-trap-support");
    }
  }

  return [...scores.values()]
    .map((v) => ({
      card: v.card,
      reasons: [...v.reasons],
      score: v.score,
      categories: [...v.categories],
    }))
    .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name))
    .slice(0, opts?.limit ?? 400);
}

export function deckGaps(cardIds: number[], index: SynergyIndex) {
  const missing: Array<{ from: CompactCard; quote: string; kind: Mention["kind"] }> = [];
  const have = new Set(cardIds);
  const names = new Set(
    cardIds
      .map((id) => index.byId.get(id)?.name)
      .filter(Boolean)
      .map((n) => norm(n as string)),
  );
  const archHave = new Set(
    cardIds
      .map((id) => index.byId.get(id)?.archetype)
      .filter(Boolean)
      .map((a) => norm(a as string)),
  );

  for (const id of [...new Set(cardIds)]) {
    const card = index.byId.get(id);
    if (!card) continue;
    for (const mention of index.mentions.get(id) ?? []) {
      if (mention.kind === "card" && mention.cardId != null && !have.has(mention.cardId)) {
        const named = index.byId.get(mention.cardId);
        if (named && names.has(norm(named.name))) continue;
        missing.push({ from: card, quote: mention.quote, kind: "card" });
      }
      if (mention.kind === "archetype" && mention.archetype && !archHave.has(norm(mention.archetype))) {
        missing.push({ from: card, quote: mention.quote, kind: "archetype" });
      }
    }
  }
  return missing.slice(0, 40);
}
