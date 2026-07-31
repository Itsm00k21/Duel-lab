import type { CompactCard } from "@/lib/cards/types";
import { cardKind } from "@/lib/cards/kinds";
import { extractQuotes, isMonster, isSpell, isTrap } from "./psct";
import { parseAllSearchSpecs, type SearchSpec } from "./searchEffect";

/** Shared multi-step resolve ops inferred from PSCT (meta-deck coverage holes). */
export type EffectOp =
  | { kind: "search"; spec: SearchSpec }
  | { kind: "choice"; label: string; options: { label: string; ops: EffectOp[] }[] }
  | {
      kind: "excavate";
      count: number;
      label: string;
      /** Optional filter on the revealed cards you may add. */
      addIf?: SearchSpec;
    }
  | {
      kind: "declare-name";
      label: string;
      pool: "normal-monster" | "main-deck";
      then: "ss-declared-normal" | "banish-declared-from-deck";
    }
  | {
      kind: "fusion-spell";
      label: string;
      from: Array<"hand" | "field" | "gy" | "banish" | "deck">;
      includeAny?: string[];
      /** Fusion must mention this quote in its text/materials. */
      mentions?: string[];
      race?: string;
      shuffleMaterials?: boolean;
      minCount: number;
      maxCount: number;
    }
  | {
      kind: "ritual-spell";
      label: string;
      includeAny?: string[];
      from: Array<"hand" | "field">;
    }
  | {
      kind: "gaze-fusion";
      label: string;
      targetNames: string[];
    }
  | {
      kind: "draw";
      label: string;
      amount: number | "sent-count" | "board-diff-names";
      nameKeys?: string[];
    }
  | {
      kind: "negate-faceup";
      label: string;
      count: number | "sent-count";
      oppOnly: boolean;
      halfAtk: boolean;
      banishAfter?: boolean;
      untilEot: true;
    };

function splitBullets(text: string): string[] {
  const flat = text.replace(/\r/g, "");
  if (!/activate 1 of (these|the following) effects/i.test(flat) && !/●/.test(flat)) return [];
  const parts = flat
    .split(/\n?●\s*/)
    .map((p) => p.replace(/activate 1 of (these|the following) effects[;:]?\s*/i, "").trim())
    .filter((p) => p.length > 8 && !/^you can only/i.test(p));
  // first chunk is preamble before bullets
  if (parts.length && !/^[A-Z●]/.test(parts[0]!) && !/special summon|add |fusion|ritual|send |draw |banish/i.test(parts[0]!)) {
    return parts.slice(1);
  }
  if (parts.length > 1 && /activate 1 of/i.test(text)) {
    return parts.filter((p, i) => i > 0 || /^(special summon|add |fusion|ritual|send |draw |banish|target)/i.test(p));
  }
  return parts.filter((p) => /●/.test(text) || parts.length > 1).slice(parts[0]?.length > 80 && !/^(special|add|fusion|ritual)/i.test(parts[0]!) ? 1 : 0);
}

function bulletLines(text: string): string[] {
  const lines = [...text.matchAll(/●\s*([^\n●]+(?:\n(?![●])[^\n●]+)*)/g)].map((m) => m[1]!.replace(/\s+/g, " ").trim());
  if (lines.length >= 2) return lines;
  const split = text.split(/●\s*/).map((s) => s.trim()).filter(Boolean);
  if (split.length >= 3) return split.slice(1).map((s) => s.replace(/\s+/g, " "));
  return lines;
}

export function parseEffectOps(text: string): EffectOp[] {
  const raw = (text || "").trim();
  if (!raw) return [];
  const bullets = bulletLines(raw);
  if (bullets.length >= 2 && /activate 1 of/i.test(raw)) {
    return [
      {
        kind: "choice",
        label: "Choose 1 effect",
        options: bullets.map((b) => ({
          label: b.slice(0, 140),
          ops: parseEffectOpsLeaf(b),
        })),
      },
    ];
  }
  return parseEffectOpsLeaf(raw);
}

function parseEffectOpsLeaf(text: string): EffectOp[] {
  const flat = text.replace(/\s+/g, " ").trim();
  const out: EffectOp[] = [];

  const exc = flat.match(/look at the top (\d+|three|3) cards of your deck/i);
  if (exc) {
    const count = /three/i.test(exc[1] ?? "") ? 3 : Number(exc[1] || 3);
    const addIf: SearchSpec = {
      count: 1,
      source: "deck",
      sources: ["deck"],
      dest: "hand",
      quotedNames: extractQuotes(flat).filter((q) => !/dark magical circle/i.test(q)),
      archetypes: [],
      mentionsNames: /mentions/i.test(flat) ? extractQuotes(flat) : undefined,
      exceptNames: [],
      typeHint: /spell\/trap|spell or trap/i.test(flat) ? "any" : "any",
      extraKinds: [],
      attributes: [],
      races: [],
      label: "Add 1 revealed card",
    };
    out.push({ kind: "excavate", count: Number.isFinite(count) ? count : 3, label: `Look at the top ${count}`, addIf });
    return out;
  }

  if (/fusion summon 1 fusion monster from your extra deck, using monsters from your hand or field/i.test(flat) || /fusion summon 1 .{0,40}fusion monster from your extra deck, using monsters from your hand or field/i.test(flat)) {
    out.push({
      kind: "fusion-spell",
      label: "Fusion Summon from hand/field",
      from: ["hand", "field"],
      includeAny: extractQuotes(flat).filter((q) => !/secrets of dark magic|polymerization|primite fusion/i.test(q)),
      minCount: 2,
      maxCount: 5,
    });
    return out;
  }
  if (/fusion summon 1 fusion monster that mentions ["“]([^"”]+)["”]/i.test(flat) && /from your (hand|deck|field)/i.test(flat)) {
    const m = flat.match(/mentions ["“]([^"”]+)["”]/i);
    out.push({
      kind: "fusion-spell",
      label: `Fusion Summon mentioning ${m?.[1] ?? "listed"}`,
      from: [/hand/i.test(flat) ? "hand" : null, /field/i.test(flat) ? "field" : null, /\bdeck\b/i.test(flat) ? "deck" : null].filter(Boolean) as Array<"hand" | "field" | "deck">,
      mentions: m?.[1] ? [m[1]] : [],
      minCount: 2,
      maxCount: 2,
    });
    return out;
  }
  if (/fusion summon 1 dragon fusion monster/i.test(flat)) {
    out.push({
      kind: "fusion-spell",
      label: "Fusion Summon Dragon (shuffle materials)",
      from: ["field", "gy", "banish"],
      includeAny: ["Normal"],
      race: "Dragon",
      shuffleMaterials: true,
      minCount: 2,
      maxCount: 5,
    });
    return out;
  }
  if (/target 1 ["“]dark magician["”] or ["“]dark magician girl["”].{0,80}fusion summon/i.test(flat)) {
    out.push({
      kind: "gaze-fusion",
      label: "Target DM/DMG; Fusion Summon mentioning it",
      targetNames: ["Dark Magician", "Dark Magician Girl"],
    });
    return out;
  }
  if (/ritual summon 1 ritual monster from your hand/i.test(flat)) {
    out.push({
      kind: "ritual-spell",
      label: "Ritual Summon from hand",
      includeAny: extractQuotes(flat),
      from: ["hand", "field"],
    });
    return out;
  }

  if (/declare 1 normal monster card name/i.test(flat) && /special summon 1 declared/i.test(flat)) {
    out.push({ kind: "declare-name", label: "Declare 1 Normal Monster", pool: "normal-monster", then: "ss-declared-normal" });
    return out;
  }
  if (/declare 1 card name/i.test(flat) && /banish 1 of that declared card from your (main )?deck/i.test(flat)) {
    out.push({ kind: "declare-name", label: "Declare 1 card name", pool: "main-deck", then: "banish-declared-from-deck" });
    return out;
  }
  if (/declare 1 normal monster card name/i.test(flat)) {
    out.push({ kind: "declare-name", label: "Declare 1 Normal Monster", pool: "normal-monster", then: "ss-declared-normal" });
    return out;
  }

  if (/draw that many cards/i.test(flat)) {
    out.push({ kind: "draw", label: "Draw that many", amount: "sent-count" });
  } else if (/draw cards equal to the number of/i.test(flat)) {
    const names = extractQuotes(flat);
    if (/dark magician/i.test(flat) && !names.includes("Dark Magician")) names.push("Dark Magician", "Dark Magician Girl");
    if (/palladium/i.test(flat) && !names.some((n) => /palladium/i.test(n))) names.push("Palladium");
    out.push({ kind: "draw", label: "Draw equal to different names", amount: "board-diff-names", nameKeys: names });
  } else {
    const drawN = flat.match(/\bdraw (\d+|a|an|one|two|three) cards?\b/i);
    if (drawN && !/cannot draw/i.test(flat)) {
      const n = /two/i.test(drawN[1]!) ? 2 : /three/i.test(drawN[1]!) ? 3 : /^(a|an|one)$/i.test(drawN[1]!) ? 1 : Number(drawN[1]);
      if (n > 0) out.push({ kind: "draw", label: `Draw ${n}`, amount: n });
    }
  }

  if (
    (/negate (its effects|their effects|the effects of that|that face-up)/i.test(flat) ||
      /their effects are negated/i.test(flat) ||
      /its effects(?: are)?(?: also)? negated/i.test(flat)) &&
    /face-up|effect monsters your opponent/i.test(flat) &&
    !/when a card or effect is activated/i.test(flat)
  ) {
    const half = /atk is halved|lose atk|atk .{0,12}halved/i.test(flat);
    const banishAfter = /and if you do, banish it/i.test(flat);
    const oppOnly = /your opponent controls|opponent'?s? (face-up )?effect monsters/i.test(flat);
    const many = /choose that many|that many effect monsters/i.test(flat);
    out.push({
      kind: "negate-faceup",
      label: many ? "Negate that many opponent monsters" : banishAfter ? "Negate and banish 1 face-up card" : "Negate 1 face-up card",
      count: many ? "sent-count" : 1,
      oppOnly,
      halfAtk: half,
      banishAfter,
      untilEot: true,
    });
  }

  const searches = parseAllSearchSpecs(flat);
  for (const spec of searches) out.push({ kind: "search", spec });

  // de-dupe identical search ops
  const seen = new Set<string>();
  return out.filter((op) => {
    const key = JSON.stringify(op);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function countDiffNamesOnFieldAndGy(
  state: { players: Record<"p1" | "p2", { monsters: Array<{ cardId: number } | null>; gy: Array<{ cardId: number }>; field?: { cardId: number } | null }> },
  byId: Map<number, CompactCard>,
  keys: string[],
): number {
  const names = new Set<string>();
  const keysN = keys.map((k) => k.toLowerCase());
  const consider = (id: number) => {
    const d = byId.get(id);
    if (!d) return;
    const n = d.name.toLowerCase();
    const arch = (d.archetype ?? "").toLowerCase();
    for (const k of keysN) {
      if (n === k || n.includes(k) || arch === k || arch.includes(k)) {
        names.add(d.name.toLowerCase());
        return;
      }
    }
  };
  for (const pid of ["p1", "p2"] as const) {
    const p = state.players[pid];
    for (const m of p.monsters) if (m) consider(m.cardId);
    for (const g of p.gy) consider(g.cardId);
  }
  return names.size;
}

export function isNormalMonsterCard(data?: CompactCard) {
  if (!data) return false;
  const t = data.type.toLowerCase();
  return t.includes("monster") && /\bnormal\b/.test(t) && !/\beffect\b/.test(t) && !/\btoken\b/.test(t);
}

export function cardMentionsName(data: CompactCard, name: string) {
  const q = name.toLowerCase();
  const d = (data.desc ?? "").toLowerCase().replace(/[“”]/g, '"');
  const n = data.name.toLowerCase();
  return n === q || n.includes(q) || d.includes(`"${q}"`) || d.includes(q);
}

export function fusionMentionsMaterial(fusion: CompactCard, materialName: string) {
  const head = (fusion.desc || "").split("\n")[0] ?? "";
  const q = materialName.toLowerCase();
  if (extractQuotes(head).some((x) => x.toLowerCase() === q || x.toLowerCase().includes(q))) return true;
  return cardMentionsName(fusion, materialName) && cardKind(fusion) === "fusion";
}

export function isSpellOrTrap(data: CompactCard) {
  return isSpell(data) || isTrap(data);
}

export function isEffectMonsterCard(data?: CompactCard) {
  if (!data || !isMonster(data)) return false;
  const t = data.type.toLowerCase();
  if (/\bnormal\b/.test(t) && !/\beffect\b/.test(t)) return false;
  return true;
}
