import type { CompactCard } from "@/lib/cards/types";
import { cardKind } from "@/lib/cards/kinds";
import type { GameState, PlayerId, ZoneCard, ZoneRef } from "@/lib/game/types";
import { extractQuotes, isSpell } from "./psct";

export type ExtraSummonSpec = {
  kind: "link" | "synchro" | "xyz" | "fusion";
  id: string;
  label: string;
  minCount: number;
  maxCount: number;
  rating?: number;
  level?: number;
  rank?: number;
  needEffect?: boolean;
  needLink?: boolean;
  needTuner?: boolean;
  differentNames?: boolean;
  differentAttributes?: boolean;
  /** Soft "including a Race" for Links. */
  race?: string;
  /** Hard race filter on every material (alt DM of Destruction procedure). */
  raceHard?: string;
  attribute?: string;
  attributes?: string[];
  levelMin?: number;
  named?: string[];
  contactFusion?: boolean;
  needsFusionSpell?: boolean;
  requiresSpellActivatedThisTurn?: boolean;
  materialsMode?: "gy" | "overlay" | "banish";
};

export type MaterialRow = { card: ZoneCard; data: CompactCard; ref: ZoneRef; where: string };

function materialHeader(card: CompactCard): string {
  const d = (card.desc || "").replace(/\s+/g, " ").trim();
  if (!d) return "";
  const cut = d.search(
    /\.\s+(Must |If |When |You can |Once per |During |Cannot |This card|While |Each |\()/i,
  );
  return (cut > 8 ? d.slice(0, cut) : d.slice(0, 240)).trim();
}

function isTuner(data: CompactCard) {
  return data.type.toLowerCase().includes("tuner");
}

function isEffectMonster(data: CompactCard) {
  const t = data.type.toLowerCase();
  if (t.includes("normal") && !t.includes("effect")) return false;
  return (
    t.includes("effect") ||
    t.includes("tuner") ||
    t.includes("fusion") ||
    t.includes("synchro") ||
    t.includes("xyz") ||
    t.includes("link") ||
    t.includes("ritual") ||
    Boolean(data.hasEffect)
  );
}

function isExtraType(data: CompactCard) {
  const k = cardKind(data);
  return k === "fusion" || k === "synchro" || k === "xyz" || k === "link";
}

export function parseExtraSummonSpec(card: CompactCard): ExtraSummonSpec | null {
  return parseAllExtraSummonSpecs(card)[0] ?? null;
}

export function parseAllExtraSummonSpecs(card: CompactCard): ExtraSummonSpec[] {
  const kind = cardKind(card);
  if (kind !== "link" && kind !== "synchro" && kind !== "xyz" && kind !== "fusion") return [];
  const head = materialHeader(card);
  const out: ExtraSummonSpec[] = [];

  if (kind === "link") {
    const rating = card.linkval ?? 2;
    const m = head.match(/\b(\d+)\+?\s+(?:effect )?monsters?\b/i);
    const minCount = m ? Number(m[1]) : Math.min(2, rating);
    out.push({
      kind: "link",
      id: "link",
      label: head || `${minCount}+ monsters for Link-${rating}`,
      minCount,
      maxCount: rating,
      rating,
      needEffect: /effect monsters?/i.test(head),
      needLink: /including a link monster/i.test(head),
      differentNames: /different names/i.test(head),
      differentAttributes: /different attributes/i.test(head),
      race: /spellcaster/i.test(head) ? "Spellcaster" : undefined,
      materialsMode: "gy",
    });
    return out;
  }

  if (kind === "synchro") {
    const level = card.level ?? 0;
    if (!level) return [];
    const non = head.match(/(\d+)\+?\s*non-tuner/i);
    const minNon = non ? Number(non[1]) : 1;
    out.push({
      kind: "synchro",
      id: "synchro",
      label: head || `1 Tuner + ${minNon}+ non-Tuner (Lv${level})`,
      minCount: 1 + minNon,
      maxCount: 6,
      level,
      needTuner: true,
      materialsMode: "gy",
    });
    return out;
  }

  if (kind === "xyz") {
    const rank = card.level ?? 0;
    if (!rank) return [];
    const m = head.match(/\b(\d+)\+?\s+level\s+(\d+)\s+monsters?/i) || head.match(/\b(\d+)\+?\s+monsters?\s+with the same level/i);
    const count = m ? Number(m[1]) : 2;
    const plus = /\d+\+/.test(head);
    out.push({
      kind: "xyz",
      id: "xyz",
      label: head || `${count}${plus ? "+" : ""} Level ${rank} monsters`,
      minCount: count,
      maxCount: plus ? 5 : count,
      rank,
      materialsMode: "overlay",
    });
    return out;
  }

  const named = extractQuotes(head);
  const gen = head.match(/\b(\d+)\+?\s+(?:effect )?monsters?\b/i);
  const contact =
    /by sending the above cards/i.test(card.desc) ||
    /special summoned \(from your extra deck\) by sending the above/i.test(card.desc) ||
    /shuffle(?:ing)? the above cards/i.test(card.desc);
  const attrOr = head.match(/\b((?:LIGHT|DARK|EARTH|WIND|FIRE|WATER|DIVINE)(?:\s+or\s+(?:LIGHT|DARK|EARTH|WIND|FIRE|WATER|DIVINE))+)\s+monster/i);
  const attributes = attrOr
    ? attrOr[1]!.split(/\s+or\s+/i).map((a) => a.toUpperCase())
    : undefined;
  const genericCount = gen ? Number(gen[1]) : named.length ? Math.max(0, 2 - named.length) : 2;
  const minCount = Math.max(named.length + (genericCount || (named.length ? 1 : 0)), named.length ? named.length + (attributes?.length ? 1 : 0) : 2, 2);
  out.push({
    kind: "fusion",
    id: "fusion",
    label: head || "Fusion materials",
    minCount,
    maxCount: minCount,
    named: named.length ? named : undefined,
    attributes,
    contactFusion: contact,
    needsFusionSpell: !contact,
    materialsMode: "gy",
  });

  const desc = (card.desc || "").replace(/\s+/g, " ");
  const alt = desc.match(
    /Special Summoned \(from your Extra Deck\)(?:,)? during the turn a Spell Card or effect is activated, by (banish(?:ing)?|sending) 1 (Level (\d+) or higher )?((?:DARK|LIGHT|EARTH|WIND|FIRE|WATER) )?([A-Za-z-]+ )?monster you control/i,
  );
  if (alt) {
    const mode = /banish/i.test(alt[1] ?? "") ? "banish" : "gy";
    const levelMin = alt[3] ? Number(alt[3]) : undefined;
    const attribute = alt[4] ? alt[4].trim().toUpperCase() : undefined;
    const raceWord = (alt[5] ?? "").trim().replace(/-/g, " ");
    const raceHard = raceWord && !/^(effect|normal|monster)$/i.test(raceWord) ? raceWord.replace(/\b\w/g, (c) => c.toUpperCase()) : undefined;
    out.push({
      kind: "fusion",
      id: "alt-banish-spellcaster",
      label: `SS from Extra: ${mode} 1 ${levelMin ? `Lv${levelMin}+ ` : ""}${attribute ? `${attribute} ` : ""}${raceHard ?? "monster"} you control (Spell activated this turn)`,
      minCount: 1,
      maxCount: 1,
      levelMin,
      attribute,
      raceHard,
      contactFusion: true,
      needsFusionSpell: false,
      requiresSpellActivatedThisTurn: /spell card or effect is activated/i.test(desc),
      materialsMode: mode,
    });
  }
  return out;
}

export function hasUsableFusionSpell(state: GameState, owner: PlayerId, byId: Map<number, CompactCard>): boolean {
  const me = state.players[owner];
  return [...me.hand, ...me.gy].some((c) => {
    const d = byId.get(c.cardId);
    if (!d || !isSpell(d)) return false;
    const blob = `${d.name} ${d.desc.slice(0, 140)}`.toLowerCase();
    if (/cannot fusion summon|cannot be used/.test(blob.slice(0, 40))) return false;
    return (
      /fusion summon/.test(blob) ||
      /polymerization/.test(blob) ||
      /\bfusion\b/.test(d.name.toLowerCase())
    );
  });
}

export function extraMaterialCandidates(
  state: GameState,
  owner: PlayerId,
  spec: ExtraSummonSpec,
  byId: Map<number, CompactCard>,
): MaterialRow[] {
  const out: MaterialRow[] = [];
  const add = (card: ZoneCard, ref: ZoneRef, where: string) => {
    if (card.isToken && spec.kind === "xyz") return;
    const data = byId.get(card.cardId);
    if (!data) return;
    if (!card.faceUp && spec.kind !== "fusion") return;
    out.push({ card, data, ref, where });
  };
  if (spec.requiresSpellActivatedThisTurn && !state.activatedSpellThisTurn) return [];
  state.players[owner].monsters.forEach((card, index) => {
    if (card) add(card, { owner, zone: "monster", index }, "Field");
  });
  state.emz.forEach((card, index) => {
    if (card) add(card, { owner: "shared", zone: "emz", index: index as 0 | 1 }, "EMZ");
  });
  if (spec.kind === "fusion" && !spec.contactFusion && spec.materialsMode !== "banish") {
    state.players[owner].hand.forEach((card, index) => {
      const data = byId.get(card.cardId);
      if (!data) return;
      if (cardKind(data) === "spell" || cardKind(data) === "trap") return;
      out.push({ card, data, ref: { owner, zone: "hand", index }, where: "Hand" });
    });
  }
  return out.filter((row) => candidateMatches(row.data, spec));
}

function candidateMatches(data: CompactCard, spec: ExtraSummonSpec): boolean {
  if (spec.needEffect && !isEffectMonster(data)) return false;
  if (spec.levelMin != null && (data.level ?? 0) < spec.levelMin) return false;
  if (spec.attribute && (data.attribute ?? "").toUpperCase() !== spec.attribute.toUpperCase()) return false;
  if (spec.raceHard && (data.race ?? "").toLowerCase() !== spec.raceHard.toLowerCase()) return false;
  if (spec.kind === "xyz") {
    if (isExtraType(data)) return false;
    if ((data.level ?? -1) !== spec.rank) return false;
  }
  if (spec.kind === "fusion") {
    const n = data.name.toLowerCase();
    const namedHit = Boolean(
      spec.named?.some((q) => n === q.toLowerCase() || n.startsWith(`${q.toLowerCase()} `)),
    );
    const attr = (data.attribute ?? "").toUpperCase();
    const attrHit = !spec.attributes?.length || spec.attributes.includes(attr);
    if (spec.named?.length && spec.attributes?.length) return namedHit || attrHit;
    if (spec.named?.length && spec.minCount <= spec.named.length) return namedHit;
    if (spec.named?.length) return namedHit || attrHit;
    if (spec.attributes?.length) return attrHit;
  }
  return true;
}

function linkValue(data: CompactCard): number {
  if (cardKind(data) === "link") return Math.max(1, data.linkval ?? 1);
  return 1;
}

function canMakeLinkRating(values: number[], rating: number): boolean {
  const n = values.length;
  const rec = (i: number, sum: number): boolean => {
    if (i === n) return sum === rating;
    const v = values[i]!;
    if (rec(i + 1, sum + 1)) return true;
    if (v > 1 && rec(i + 1, sum + v)) return true;
    return false;
  };
  return rec(0, 0);
}

export function validateExtraMaterials(
  spec: ExtraSummonSpec,
  picks: MaterialRow[],
  state: GameState,
  owner: PlayerId,
  byId: Map<number, CompactCard>,
): { ok: boolean; reason: string } {
  if (picks.length < spec.minCount) return { ok: false, reason: `Need at least ${spec.minCount} material(s).` };
  if (picks.length > spec.maxCount) return { ok: false, reason: `At most ${spec.maxCount} material(s).` };
  const ids = new Set(picks.map((p) => p.card.instanceId));
  if (ids.size !== picks.length) return { ok: false, reason: "Duplicate material." };

  if (spec.differentNames) {
    const names = picks.map((p) => p.data.name.toLowerCase());
    if (new Set(names).size !== names.length) return { ok: false, reason: "Materials must have different names." };
  }
  if (spec.differentAttributes) {
    const attrs = picks.map((p) => (p.data.attribute ?? "").toUpperCase());
    if (attrs.some((a) => !a) || new Set(attrs).size !== attrs.length) {
      return { ok: false, reason: "Materials must have different Attributes." };
    }
  }
  if (spec.needLink && !picks.some((p) => cardKind(p.data) === "link")) {
    return { ok: false, reason: "Must include a Link Monster." };
  }
  if (spec.race && spec.kind === "link" && !picks.some((p) => p.data.race?.toLowerCase() === spec.race!.toLowerCase())) {
    return { ok: false, reason: `Must include a ${spec.race}.` };
  }

  if (spec.kind === "link") {
    const rating = spec.rating ?? 0;
    if (!canMakeLinkRating(picks.map((p) => linkValue(p.data)), rating)) {
      return { ok: false, reason: `Materials must equal Link Rating ${rating}.` };
    }
  }

  if (spec.kind === "synchro") {
    const tuners = picks.filter((p) => isTuner(p.data));
    const others = picks.filter((p) => !isTuner(p.data));
    if (tuners.length < 1) return { ok: false, reason: "Need at least 1 Tuner." };
    if (others.length < 1) return { ok: false, reason: "Need at least 1 non-Tuner." };
    const sum = picks.reduce((s, p) => s + (p.data.level ?? 0), 0);
    if (sum !== spec.level) return { ok: false, reason: `Levels must equal ${spec.level} (have ${sum}).` };
  }

  if (spec.kind === "xyz") {
    if (!picks.every((p) => (p.data.level ?? -1) === spec.rank && !isExtraType(p.data))) {
      return { ok: false, reason: `Need Level ${spec.rank} non-Extra monsters.` };
    }
  }

  if (spec.kind === "fusion") {
    if (spec.requiresSpellActivatedThisTurn && !state.activatedSpellThisTurn) {
      return { ok: false, reason: "A Spell Card or effect must have been activated this turn." };
    }
    if (spec.needsFusionSpell && !hasUsableFusionSpell(state, owner, byId)) {
      return { ok: false, reason: "Need a Fusion Spell in hand or GY (e.g. Polymerization / Primite Fusion)." };
    }
    if (spec.named?.length) {
      const used = new Set<string>();
      for (const name of spec.named) {
        const hit = picks.find((p) => {
          if (used.has(p.card.instanceId)) return false;
          const n = p.data.name.toLowerCase();
          return n === name.toLowerCase() || n.startsWith(`${name.toLowerCase()} `);
        });
        if (!hit) return { ok: false, reason: `Missing fusion material: ${name}.` };
        used.add(hit.card.instanceId);
      }
      if (spec.attributes?.length) {
        const rest = picks.filter((p) => !used.has(p.card.instanceId));
        for (const p of rest) {
          const attr = (p.data.attribute ?? "").toUpperCase();
          if (!spec.attributes.includes(attr)) {
            return { ok: false, reason: `Other material must be ${spec.attributes.join(" or ")}.` };
          }
        }
      }
    }
    if (spec.levelMin != null || spec.raceHard || spec.attribute) {
      for (const p of picks) {
        if (spec.levelMin != null && (p.data.level ?? 0) < spec.levelMin) {
          return { ok: false, reason: `Material must be Level ${spec.levelMin} or higher.` };
        }
        if (spec.attribute && (p.data.attribute ?? "").toUpperCase() !== spec.attribute) {
          return { ok: false, reason: `Material must be ${spec.attribute}.` };
        }
        if (spec.raceHard && (p.data.race ?? "").toLowerCase() !== spec.raceHard.toLowerCase()) {
          return { ok: false, reason: `Material must be a ${spec.raceHard}.` };
        }
      }
    }
  }

  return { ok: true, reason: spec.label };
}

export function autoPickExtraMaterials(
  state: GameState,
  owner: PlayerId,
  card: CompactCard,
  byId: Map<number, CompactCard>,
): { refs: ZoneRef[]; spec: ExtraSummonSpec } | null {
  for (const spec of parseAllExtraSummonSpecs(card)) {
    if (spec.requiresSpellActivatedThisTurn && !state.activatedSpellThisTurn) continue;
    if (spec.needsFusionSpell && !hasUsableFusionSpell(state, owner, byId)) continue;
    const pool = extraMaterialCandidates(state, owner, spec, byId);
    const n = Math.min(spec.maxCount, pool.length);
    for (let count = spec.minCount; count <= n; count += 1) {
      const combo = firstCombo(pool, count, spec, state, owner, byId);
      if (combo) return { refs: combo.map((r) => r.ref), spec };
    }
  }
  return null;
}

function firstCombo(
  pool: MaterialRow[],
  count: number,
  spec: ExtraSummonSpec,
  state: GameState,
  owner: PlayerId,
  byId: Map<number, CompactCard>,
): MaterialRow[] | null {
  const rec = (start: number, acc: MaterialRow[]): MaterialRow[] | null => {
    if (acc.length === count) {
      return validateExtraMaterials(spec, acc, state, owner, byId).ok ? acc : null;
    }
    for (let i = start; i < pool.length; i += 1) {
      const hit = rec(i + 1, [...acc, pool[i]!]);
      if (hit) return hit;
    }
    return null;
  };
  return rec(0, []);
}

