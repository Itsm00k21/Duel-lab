import type { CompactCard } from "./types";
import { resolveCardImage, type RawCardImage } from "./images";
import { applyCardLegalityFixes } from "./legality";

type RawCard = {
  id: number;
  name: string;
  type?: string;
  frameType?: string;
  desc?: string;
  atk?: number | null;
  def?: number | null;
  level?: number | null;
  race?: string;
  attribute?: string;
  scale?: number | null;
  linkval?: number | null;
  linkmarkers?: string[];
  archetype?: string;
  card_images?: RawCardImage[];
  banlist_info?: {
    ban_tcg?: string;
    ban_ocg?: string;
    ban_goat?: string;
  };
  misc_info?: Array<{
    formats?: string[];
    tcg_date?: string;
    ocg_date?: string;
    treated_as?: string;
    has_effect?: number;
    genesys_points?: number;
  }>;
  genesys_points?: number;
};

function num(value: number | null | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function decodeCardText(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function compactCard(raw: RawCard): CompactCard {
  const misc = raw.misc_info?.[0];
  const card: CompactCard = {
    id: raw.id,
    name: decodeCardText(raw.name),
    type: raw.type ?? "Unknown",
    frameType: raw.frameType ?? "effect",
    desc: decodeCardText(raw.desc ?? ""),
  };

  const atk = num(raw.atk);
  const def = num(raw.def);
  const level = num(raw.level);
  const scale = num(raw.scale);
  const linkval = num(raw.linkval);

  if (atk !== undefined) card.atk = atk;
  if (def !== undefined) card.def = def;
  if (level !== undefined) card.level = level;
  if (raw.race) card.race = raw.race;
  if (raw.attribute) card.attribute = raw.attribute;
  if (scale !== undefined) card.scale = scale;
  if (linkval !== undefined) card.linkval = linkval;
  if (raw.linkmarkers?.length) card.linkmarkers = raw.linkmarkers;
  if (raw.archetype) card.archetype = raw.archetype;
  if (raw.banlist_info?.ban_tcg) card.banTcg = raw.banlist_info.ban_tcg;
  if (raw.banlist_info?.ban_ocg) card.banOcg = raw.banlist_info.ban_ocg;
  if (raw.banlist_info?.ban_goat) card.banGoat = raw.banlist_info.ban_goat;
  if (misc?.formats?.length) card.formats = misc.formats;
  if (misc?.tcg_date) card.tcgDate = misc.tcg_date;
  if (misc?.ocg_date) card.ocgDate = misc.ocg_date;
  if (misc?.treated_as) card.treatedAs = misc.treated_as;
  if (typeof misc?.has_effect === "number") card.hasEffect = misc.has_effect === 1;

  const genesys = num(raw.genesys_points) ?? num(misc?.genesys_points);
  if (genesys !== undefined) card.genesys = genesys;

  const art = resolveCardImage(raw.id, raw.card_images);
  if (art) {
    card.imageId = art.imageId;
    card.imageMatch = art.match;
    if (art.altImageIds.length) card.altImageIds = art.altImageIds;
  } else {
    card.imageMatch = "none";
  }

  return applyCardLegalityFixes(card);
}

export function isExtraDeckType(type: string) {
  const t = type.toLowerCase();
  // Fusion / Synchro / Xyz / Link always live in the Extra Deck, including
  // Pendulum versions (e.g. Pendulum Fusion). Name text like "Synchro" on a
  // Spell does not match because those types are "Spell Card".
  return t.includes("fusion") || t.includes("synchro") || t.includes("xyz") || t.includes("link");
}

export function isPendulum(type: string, frameType?: string) {
  return (
    type.toLowerCase().includes("pendulum") ||
    (frameType?.toLowerCase().includes("pendulum") ?? false)
  );
}

export function isSpellOrTrap(type: string) {
  const t = type.toLowerCase();
  return t.includes("spell") || t.includes("trap");
}

export function frameClass(frameType: string) {
  switch (frameType.toLowerCase()) {
    case "normal":
      return "bg-gradient-to-b from-amber-200 to-yellow-700 text-zinc-900";
    case "effect":
      return "bg-gradient-to-b from-orange-300 to-orange-800 text-zinc-950";
    case "ritual":
      return "bg-gradient-to-b from-slate-200 to-indigo-700 text-white";
    case "fusion":
      return "bg-gradient-to-b from-fuchsia-200 to-purple-800 text-white";
    case "synchro":
      return "bg-gradient-to-b from-zinc-100 to-zinc-600 text-zinc-900";
    case "xyz":
      return "bg-gradient-to-b from-zinc-700 to-black text-white";
    case "link":
      return "bg-gradient-to-b from-sky-300 to-blue-900 text-white";
    case "spell":
      return "bg-gradient-to-b from-emerald-300 to-teal-800 text-white";
    case "trap":
      return "bg-gradient-to-b from-pink-300 to-rose-800 text-white";
    case "token":
      return "bg-gradient-to-b from-stone-300 to-stone-700 text-zinc-900";
    default:
      if (frameType.toLowerCase().includes("pendulum")) {
        return "bg-gradient-to-b from-orange-300 via-lime-400 to-teal-800 text-zinc-950";
      }
      return "bg-gradient-to-b from-zinc-300 to-zinc-700 text-white";
  }
}
