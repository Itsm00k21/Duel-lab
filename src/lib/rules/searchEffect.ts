import type { CompactCard } from "@/lib/cards/types";
import { cardKind, type CardKind } from "@/lib/cards/kinds";
import { isMonster, isSpell, isTrap, extractQuotes } from "./psct";
import type { GameState, PlayerId, ZoneCard } from "@/lib/game/types";

export type SearchSource = "deck" | "gy" | "extra" | "banish" | "hand";
export type SearchDest = "hand" | "set-st" | "summon" | "gy" | "banish" | "top-deck";

export type SearchSpec = {
  count: number;
  source: SearchSource;
  sources: SearchSource[];
  dest: SearchDest;
  quotedNames: string[];
  archetypes: string[];
  /** Match cards that are this name or mention it in their text (Soul Servant). */
  mentionsNames?: string[];
  exceptNames: string[];
  typeHint: "monster" | "spell" | "trap" | "spell-trap" | "any";
  extraKinds: CardKind[];
  attributes: string[];
  races: string[];
  levelMin?: number;
  levelMax?: number;
  levelEq?: number;
  normalMonster?: boolean;
  position?: "atk" | "def";
  label: string;
  /** After picking a monster, send floor(level/divisor) matching cards, then SS (Hallowed Azamina). */
  sendPerLevels?: {
    divisor: number;
    archetypes: string[];
    sources: SearchSource[];
    label: string;
  };
};

const ATTRS = ["dark", "light", "earth", "wind", "fire", "water", "divine"] as const;
const RACES: Array<{ needle: string; race: string }> = [
  { needle: "spellcaster", race: "Spellcaster" },
  { needle: "beast-warrior", race: "Beast-Warrior" },
  { needle: "winged beast", race: "Winged Beast" },
  { needle: "sea serpent", race: "Sea Serpent" },
  { needle: "divine-beast", race: "Divine-Beast" },
  { needle: "warrior", race: "Warrior" },
  { needle: "dragon", race: "Dragon" },
  { needle: "fiend", race: "Fiend" },
  { needle: "zombie", race: "Zombie" },
  { needle: "machine", race: "Machine" },
  { needle: "aqua", race: "Aqua" },
  { needle: "pyro", race: "Pyro" },
  { needle: "rock", race: "Rock" },
  { needle: "plant", race: "Plant" },
  { needle: "insect", race: "Insect" },
  { needle: "thunder", race: "Thunder" },
  { needle: "dinosaur", race: "Dinosaur" },
  { needle: "fish", race: "Fish" },
  { needle: "reptile", race: "Reptile" },
  { needle: "psychic", race: "Psychic" },
  { needle: "cyberse", race: "Cyberse" },
  { needle: "illusion", race: "Illusion" },
  { needle: "fairy", race: "Fairy" },
  { needle: "wyrm", race: "Wyrm" },
  { needle: "beast", race: "Beast" },
];

const SRC_ALT = String.raw`extra deck|deck|graveyard|gy|hand|banished(?: cards?)?(?: zone)?`;
const SEARCH_RE = new RegExp(
  String.raw`\b(add|set|send|take|special summon)\b(?: up to)?(?: (\d+|a|an|one|two|three))?\s+([^.;:\n]{3,140}?)\s+from (?:your |either |the |a |an )?((?:${SRC_ALT})(?:(?:,\s*|\s+or\s+|\s+and/or\s+|\s+and\s+)+(?:your |the |a |an )?(?:${SRC_ALT}))*)`,
  "gi",
);

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function sourceOf(raw: string): SearchSource | null {
  const t = raw.toLowerCase();
  if (t.includes("extra deck")) return "extra";
  if (/\bdeck\b/.test(t)) return "deck";
  if (/\b(gy|graveyard)\b/.test(t)) return "gy";
  if (/\bhand\b/.test(t)) return "hand";
  if (/banish/.test(t)) return "banish";
  return null;
}

function parseSources(raw: string): SearchSource[] {
  const out: SearchSource[] = [];
  const re = /extra deck|deck|graveyard|\bgy\b|hand|banished/gi;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(raw))) {
    const src = sourceOf(hit[0]);
    if (src && !out.includes(src)) out.push(src);
    if (hit[0].toLowerCase() === "extra deck") re.lastIndex = (hit.index ?? 0) + hit[0].length;
  }
  return out;
}

function specFromMatch(flat: string, m: RegExpMatchArray): SearchSpec | null {
  const before = flat.slice(Math.max(0, (m.index ?? 0) - 48), m.index ?? 0).toLowerCase();
  if (/\b(only|cannot|can't|never)\s*$/.test(before)) return null;
  if (/for every \d+ levels?|round down/.test(before)) return null;

  const verb = m[1].toLowerCase();
  const countRaw = (m[2] ?? "1").toLowerCase();
  const mid = m[3].trim();
  const sources = parseSources(m[4] ?? "");
  const src = sources[0] ?? sourceOf(m[4] ?? "");
  if (!src) return null;
  if (/^(once|twice|thrice|\d+\s+times?)$/i.test(mid)) return null;
  if (/^only\b/i.test(mid)) return null;

  const count = countRaw === "two" || countRaw === "2" ? 2 : countRaw === "three" || countRaw === "3" ? 3 : 1;

  let dest: SearchDest = "hand";
  if (verb === "set") dest = "set-st";
  else if (verb === "send") dest = "gy";
  else if (verb === "special summon") dest = "summon";
  else if (/\bto (?:your |the )?(?:gy|graveyard)\b/i.test(flat.slice(m.index ?? 0, (m.index ?? 0) + 220))) dest = "gy";
  else if (/\bto your hand\b/i.test(flat) || verb === "add" || verb === "take") dest = "hand";

  const quotedNames: string[] = [];
  const archetypes: string[] = [];
  for (const q of extractQuotes(mid)) {
    const idx = mid.toLowerCase().indexOf(`"${q.toLowerCase()}"`);
    const after = idx >= 0 ? mid.slice(idx + q.length + 2, idx + q.length + 28) : "";
    if (/^\s*(\/ )?(card|spell|trap|spell\/trap|monster)/i.test(after)) archetypes.push(q);
    else quotedNames.push(q);
  }

  const exceptNames: string[] = [];
  const window = flat.slice(m.index ?? 0, (m.index ?? 0) + Math.max(280, mid.length + 140));
  for (const ex of window.matchAll(/except ["“]([^"”]+)["”]/gi)) {
    if (ex[1]) exceptNames.push(ex[1]);
  }

  // "a card that mentions 'Dark Magician'" / "or 1 card that mentions it"
  const mentionBlob = `${mid} ${window}`;
  const mentionSearch = /\bmentions?\b|\bspecifically lists\b|\bin its text\b/i.test(mentionBlob);
  const mentionsNames: string[] = [];
  if (mentionSearch) {
    for (const q of [...quotedNames, ...extractQuotes(window)]) {
      if (!exceptNames.some((e) => norm(e) === norm(q)) && !mentionsNames.some((x) => norm(x) === norm(q))) {
        mentionsNames.push(q);
      }
    }
    if (/\bmentions it\b/i.test(mentionBlob)) {
      for (const q of quotedNames) {
        if (!mentionsNames.some((x) => norm(x) === norm(q))) mentionsNames.push(q);
      }
    }
  }

  let typeHint: SearchSpec["typeHint"] = "any";
  if (/spell\/trap|spell or trap/i.test(mid)) typeHint = "spell-trap";
  else if (/\btrap\b/i.test(mid) && !/\bspell\b/i.test(mid)) typeHint = "trap";
  else if (/\bspell\b/i.test(mid) && !/\btrap\b/i.test(mid)) typeHint = "spell";
  else if (/\bmonster\b/i.test(mid)) typeHint = "monster";

  const extraKinds: CardKind[] = [];
  if (/fusion/i.test(mid)) extraKinds.push("fusion");
  if (/synchro/i.test(mid)) extraKinds.push("synchro");
  if (/xyz/i.test(mid)) extraKinds.push("xyz");
  if (/\blink\b/i.test(mid)) extraKinds.push("link");

  const midL = mid.toLowerCase().replace(/["“][^"”]+["”]/g, " ");
  const attributes = ATTRS.filter((a) => new RegExp(`\\b${a}\\b`, "i").test(midL)).map((a) => a.toUpperCase());
  const races: string[] = [];
  for (const row of RACES) {
    if (!midL.includes(row.needle)) continue;
    if (row.needle === "beast" && (midL.includes("beast-warrior") || midL.includes("winged beast") || midL.includes("divine-beast"))) {
      continue;
    }
    if (row.needle === "warrior" && midL.includes("beast-warrior")) continue;
    races.push(row.race);
  }

  let levelMin: number | undefined;
  let levelMax: number | undefined;
  let levelEq: number | undefined;
  const lvLower = mid.match(/level (\d+)\s+or\s+(lower|less)/i);
  const lvHigher = mid.match(/level (\d+)\s+or\s+(higher|more)/i);
  const lvExact = mid.match(/level (\d+)\b/i);
  if (lvLower) levelMax = Number(lvLower[1]);
  else if (lvHigher) levelMin = Number(lvHigher[1]);
  else if (lvExact) levelEq = Number(lvExact[1]);

  if (attributes.length || races.length || levelMin != null || levelMax != null || levelEq != null) {
    if (typeHint === "any") typeHint = "monster";
  }

  const normalMonster = /\bnormal monster/i.test(mid);
  if (normalMonster && typeHint === "any") typeHint = "monster";

  if (
    !quotedNames.length &&
    !archetypes.length &&
    !mentionsNames.length &&
    typeHint === "any" &&
    extraKinds.length === 0 &&
    !attributes.length &&
    !races.length &&
    levelMin == null &&
    levelMax == null &&
    levelEq == null &&
    !normalMonster
  ) {
    return null;
  }

  const afterVerb = flat.slice(m.index ?? 0, (m.index ?? 0) + 260);
  const position: "atk" | "def" | undefined = /in defense position/i.test(afterVerb)
    ? "def"
    : /in attack position/i.test(afterVerb)
      ? "atk"
      : undefined;

  const filterBits = [
    ...attributes,
    ...races,
    levelMax != null ? `Lv≤${levelMax}` : "",
    levelMin != null ? `Lv≥${levelMin}` : "",
    levelEq != null ? `Lv${levelEq}` : "",
  ].filter(Boolean);

  const label =
    dest === "set-st"
      ? `Set ${count > 1 ? count : "1"} from ${src}${quotedNames[0] ? ` (${quotedNames.join(" / ")})` : archetypes[0] ? ` (${archetypes.join(" / ")})` : ""}`
      : dest === "summon"
        ? `Special Summon from ${sources.join("/")}${
            quotedNames[0] ? ` (${quotedNames.join(" / ")})` : normalMonster ? " (Normal Monster)" : filterBits.length ? ` (${filterBits.join(" ")})` : ""
          }${position === "def" ? " in DEF" : ""}`
        : dest === "gy"
          ? `Send to GY from ${src}`
          : `Add from ${src}${
              mentionsNames[0]
                ? ` (mentions ${mentionsNames.join(" / ")})`
                : quotedNames[0]
                  ? ` (${quotedNames.join(" / ")})`
                  : archetypes[0]
                    ? ` (${archetypes.join(" / ")})`
                    : ""
            }`;

  return {
    count,
    source: src,
    sources,
    dest,
    quotedNames: mentionSearch && !/\bor 1 ["“]|or 1 card that mentions it/i.test(mentionBlob) ? [] : quotedNames,
    archetypes,
    mentionsNames: mentionsNames.length ? mentionsNames : undefined,
    exceptNames,
    typeHint,
    extraKinds,
    attributes,
    races,
    levelMin,
    levelMax,
    levelEq,
    normalMonster: normalMonster || undefined,
    position,
    label,
  };
}

const PLACE_TOP_RE = new RegExp(
  String.raw`\bplace\b(?: up to)?(?: (\d+|a|an|one))?\s+(.{0,80}?)\s+on top of (?:your |the )?deck(?:(?:,)?\s+from (?:your |either |the |a |an )?((?:${SRC_ALT})(?:(?:,\s*|\s+or\s+|\s+and/or\s+|\s+and\s+)+(?:your |the |a |an )?(?:${SRC_ALT}))*))?`,
  "gi",
);

function specFromPlaceTop(flat: string, m: RegExpMatchArray): SearchSpec | null {
  const countRaw = (m[1] ?? "1").toLowerCase();
  const count = countRaw === "two" || countRaw === "2" ? 2 : countRaw === "three" || countRaw === "3" ? 3 : 1;
  const sources = parseSources(m[3] ?? "deck");
  const src = sources[0] ?? "deck";
  const window = flat.slice(m.index ?? 0, (m.index ?? 0) + 320);
  const exceptNames: string[] = [];
  for (const ex of window.matchAll(/except ["“]([^"”]+)["”]/gi)) {
    if (ex[1]) exceptNames.push(ex[1]);
  }
  const quotes = extractQuotes(window).filter((q) => !exceptNames.some((e) => norm(e) === norm(q)));
  const mentionsNames = /mention|specifically lists|in its text/i.test(window) ? quotes : [];
  const thatIs = [...window.matchAll(/that is ["“]([^"”]+)["”]/gi)].map((x) => x[1]!).filter(Boolean);
  const quotedNames = thatIs.length ? thatIs : mentionsNames.length ? [] : quotes;
  if (!quotedNames.length && !mentionsNames.length && !quotes.length) return null;
  const allMentions = [...new Set([...mentionsNames, ...quotes])];
  return {
    count,
    source: src,
    sources: sources.length ? sources : ["deck", "hand", "gy"],
    dest: "top-deck",
    quotedNames,
    archetypes: [],
    mentionsNames: allMentions.length ? allMentions : undefined,
    exceptNames,
    typeHint: "any",
    extraKinds: [],
    attributes: [],
    races: [],
    label: `Place on top of the Deck (${allMentions.slice(0, 2).join(" / ") || "listed cards"})`,
  };
}

function specFromRevealExtraSummon(flat: string): SearchSpec | null {
  if (!/reveal 1 .{2,80}(fusion )?monster in your extra deck/i.test(flat)) return null;
  if (!/special summon that revealed monster/i.test(flat)) return null;
  const revealChunk = flat.slice(flat.toLowerCase().indexOf("reveal"), flat.toLowerCase().indexOf("reveal") + 120);
  const arch = extractQuotes(revealChunk);
  const scale = flat.match(/for every (\d+) levels?[^\n.;]{0,80}?send 1 ["“]([^"”]+)["”]/i);
  const divisor = scale?.[1] ? Number(scale[1]) : 4;
  const sendArch = scale?.[2] ? [scale[2]] : extractQuotes(flat.match(/send 1 ["“]([^"”]+)["”]/i)?.[0] ?? "");
  return {
    count: 1,
    source: "extra",
    sources: ["extra"],
    dest: "summon",
    quotedNames: [],
    archetypes: arch.length ? arch : ["Azamina"],
    exceptNames: [],
    typeHint: "monster",
    extraKinds: /fusion/i.test(revealChunk) ? ["fusion"] : [],
    attributes: [],
    races: [],
    label: `Reveal & Special Summon from Extra (${arch[0] ?? "listed"} Fusion)`,
    sendPerLevels: sendArch.length
      ? {
          divisor: Number.isFinite(divisor) && divisor > 0 ? divisor : 4,
          archetypes: sendArch,
          sources: ["hand"],
          label: `Send ${sendArch.join("/")} from hand/field (Lv÷${divisor || 4})`,
        }
      : undefined,
  };
}

export function parseSearchSpec(text: string): SearchSpec | null {
  return parseAllSearchSpecs(text)[0] ?? null;
}

export function parseAllSearchSpecs(text: string): SearchSpec[] {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return [];
  if (/\bcannot (add|set|special summon)\b/i.test(flat)) return [];

  const out: SearchSpec[] = [];
  const re = new RegExp(SEARCH_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) {
    const spec = specFromMatch(flat, m);
    if (spec) out.push(spec);
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  const placeRe = new RegExp(PLACE_TOP_RE.source, "gi");
  while ((m = placeRe.exec(flat))) {
    const spec = specFromPlaceTop(flat, m);
    if (spec) out.push(spec);
    if (m.index === placeRe.lastIndex) placeRe.lastIndex += 1;
  }
  const reveal = specFromRevealExtraSummon(flat);
  if (reveal) out.push(reveal);
  const seen = new Set<string>();
  return out.filter((s) => {
    const key = `${s.dest}|${s.source}|${s.sources.join(",")}|${s.quotedNames.join(",")}|${(s.archetypes ?? []).join(",")}|${(s.mentionsNames ?? []).join(",")}|${s.exceptNames.join(",")}|${s.typeHint}|${s.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function cardMatchesSearch(card: CompactCard, spec: SearchSpec): boolean {
  const kind = cardKind(card);
  if (spec.exceptNames?.some((n) => norm(n) === norm(card.name))) return false;
  if (spec.normalMonster) {
    const t = card.type.toLowerCase();
    if (!/\bnormal\b/.test(t) || /\beffect\b/.test(t)) return false;
  }
  if (spec.typeHint === "monster" && (isSpell(card) || isTrap(card))) return false;
  if (spec.typeHint === "spell" && !isSpell(card)) return false;
  if (spec.typeHint === "trap" && !isTrap(card)) return false;
  if (spec.typeHint === "spell-trap" && !isSpell(card) && !isTrap(card)) return false;
  if (spec.extraKinds.length && !spec.extraKinds.includes(kind)) return false;

  if (spec.attributes.length) {
    const attr = (card.attribute ?? "").toUpperCase();
    if (!spec.attributes.includes(attr)) return false;
  }
  if (spec.races.length) {
    const race = norm(card.race ?? "");
    if (!spec.races.some((r) => race === norm(r))) return false;
  }
  if (isMonster(card) && (spec.levelMin != null || spec.levelMax != null || spec.levelEq != null)) {
    const lv = card.level;
    if (lv == null) return false;
    if (spec.levelEq != null && lv !== spec.levelEq) return false;
    if (spec.levelMin != null && lv < spec.levelMin) return false;
    if (spec.levelMax != null && lv > spec.levelMax) return false;
  }

  const n = norm(card.name);
  const treated = card.treatedAs ? norm(card.treatedAs) : "";
  const arch = card.archetype ? norm(card.archetype) : "";

  const nameHit = spec.quotedNames.some((q) => {
    const qn = norm(q);
    return n === qn || treated === qn || n.startsWith(`${qn} `) || n.includes(` ${qn}`);
  });
  const archHit = spec.archetypes.some((a) => {
    const an = norm(a);
    return arch === an || arch.includes(an) || n.includes(an);
  });
  const mentionHit = (spec.mentionsNames ?? []).some((q) => {
    const qn = norm(q);
    if (!qn) return false;
    if (n === qn || treated === qn || n.includes(qn)) return true;
    const d = (card.desc ?? "").toLowerCase();
    return d.includes(qn);
  });

  if (spec.mentionsNames?.length) return mentionHit || nameHit || archHit;
  if (spec.quotedNames.length && spec.archetypes.length) return nameHit || archHit;
  if (spec.quotedNames.length) return nameHit;
  if (spec.archetypes.length) return archHit;
  return true;
}

export function searchPile(state: GameState, owner: PlayerId, source: SearchSource): ZoneCard[] {
  const p = state.players[owner];
  if (source === "deck") return p.deck;
  if (source === "gy") return p.gy;
  if (source === "extra") return p.extra;
  if (source === "hand") return p.hand;
  return p.banish;
}

export function findSearchCandidates(
  state: GameState,
  owner: PlayerId,
  spec: SearchSpec,
  byId: Map<number, CompactCard>,
): Array<{ card: ZoneCard; data: CompactCard; index: number; source: SearchSource }> {
  const sources = spec.sources?.length ? spec.sources : [spec.source];
  const out: Array<{ card: ZoneCard; data: CompactCard; index: number; source: SearchSource }> = [];
  for (const source of sources) {
    const pile = searchPile(state, owner, source);
    pile.forEach((card, index) => {
      const data = byId.get(card.cardId);
      if (!data) return;
      if (!cardMatchesSearch(data, spec)) return;
      out.push({ card, data, index, source });
    });
  }
  return out;
}
