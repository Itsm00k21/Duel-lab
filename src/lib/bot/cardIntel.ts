import type { CompactCard } from "@/lib/cards/types";
import type { GameState, PlayerId } from "@/lib/game/types";
import { activationOptions } from "@/lib/rules/activationWindow";
import { parseIncludesFromText, type EffectInclude } from "@/lib/rules/effectProfile";
import { isMonster, isQuickPlaySpell, isSpell, isTrap, parseCard } from "@/lib/rules/psct";
import type { BotProfile } from "./types";

export type CardRole =
  | "starter"
  | "extender"
  | "search"
  | "boss"
  | "negate"
  | "breaker"
  | "backrow"
  | "handtrap"
  | "gy"
  | "normal";

export type CardIntel = {
  id: number;
  name: string;
  roles: CardRole[];
  includes: EffectInclude[];
  oncePerTurn: boolean;
  fromHand: boolean;
  fromGY: boolean;
  summary: string;
  interaction: number;
};

const HANDTRAPS = new Set(
  [
    "ash blossom & joyous spring",
    "effect veiler",
    'maxx "c"',
    "nibiru, the primal being",
    "droll & lock bird",
    "ghost belle & haunted mansion",
    "mulcharmy fuwalos",
    "infinite impermanence",
    "called by the grave",
  ].map((s) => s.toLowerCase()),
);

function norm(s: string) {
  return s.toLowerCase().replace(/['’]/g, "").trim();
}

export function analyzeCard(card: CompactCard, profile?: BotProfile): CardIntel {
  const desc = card.desc ?? "";
  const lower = desc.toLowerCase();
  const includes = parseIncludesFromText(desc);
  const clauses = parseCard(card);
  const roles = new Set<CardRole>();
  const name = card.name;

  if (HANDTRAPS.has(norm(name)) || /quick effect/.test(lower) && /discard this card|send this card from your hand/.test(lower)) {
    roles.add("handtrap");
  }
  if (includes.includes("negate-activation") || includes.includes("negate-effect") || /\bnegate\b/.test(lower)) {
    roles.add("negate");
  }
  if (includes.includes("add-deck-hand") || /add .{2,60} from your deck to (?:your )?hand/i.test(desc)) {
    roles.add("search");
  }
  if (includes.includes("ss-deck") || includes.includes("ss-extra") || /fusion summon|synchro summon|xyz summon|link summon|ritual summon/i.test(desc)) {
    roles.add("extender");
  }
  if (isTrap(card) || (isQuickPlaySpell(card) && /target|destroy|negate/.test(lower))) {
    roles.add("backrow");
  }
  if (clauses.some((c) => c.fromGY) || /if this card is in (?:your |the )?gy|banish this card from (?:your )?gy/i.test(desc)) {
    roles.add("gy");
  }
  if (profile) {
    if (profile.normalSummon.some((n) => norm(n) === norm(name)) || profile.engineSpells.some((n) => norm(n) === norm(name))) {
      roles.add("starter");
    }
    if (profile.endBoard.some((n) => norm(n) === norm(name)) || profile.extraBosses.some((n) => norm(n) === norm(name))) {
      roles.add("boss");
    }
    if (profile.breakers.some((n) => norm(n) === norm(name))) roles.add("breaker");
  }
  if (!roles.size) {
    if (isSpell(card) && /add |special summon|fusion |set 1 /.test(lower)) roles.add("search");
    else if (isMonster(card)) roles.add("normal");
  }

  let interaction = 0;
  if (roles.has("negate")) interaction += 3;
  if (roles.has("handtrap")) interaction += 2;
  if (roles.has("backrow")) interaction += 1;
  if (roles.has("boss")) interaction += 2;
  if (/\bunaffected\b|\bcannot be destroyed\b|\bonce per turn.*negate/i.test(desc)) interaction += 2;

  const head = (clauses[0]?.resolution || clauses[0]?.condition || desc).replace(/\s+/g, " ").trim();
  return {
    id: card.id,
    name,
    roles: [...roles],
    includes,
    oncePerTurn: /once per turn|only use each|only activate 1 /i.test(desc),
    fromHand: clauses.some((c) => c.fromHand) || isSpell(card) || isTrap(card),
    fromGY: clauses.some((c) => c.fromGY),
    summary: head.slice(0, 140),
    interaction,
  };
}

export function cardUsefulNow(
  state: GameState,
  owner: PlayerId,
  card: CompactCard,
  loc: "hand" | "field" | "st" | "gy",
  zoneCard: { instanceId: string; faceUp: boolean; cardId: number; position: "atk" | "def"; counters: number; overlay: never[] },
  byId: Map<number, CompactCard>,
): boolean {
  const opts = activationOptions(state, card, zoneCard as never, loc, owner, byId);
  return opts.length > 0;
}

export function isStarterName(name: string, profile: BotProfile) {
  return profile.normalSummon.some((n) => norm(n) === norm(name)) || profile.engineSpells.some((n) => norm(n) === norm(name));
}

export function isEndBoardName(name: string, profile: BotProfile) {
  return profile.endBoard.some((n) => norm(n) === norm(name)) || profile.extraBosses.slice(0, 4).some((n) => norm(n) === norm(name));
}
