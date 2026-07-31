import type { CompactCard } from "@/lib/cards/types";

export type EffectKind =
  | "continuous"
  | "ignition"
  | "trigger"
  | "quick"
  | "flip"
  | "summoning"
  | "activation"
  | "unclassified";

export type ParsedClause = {
  raw: string;
  condition?: string;
  cost?: string;
  resolution: string;
  kind: EffectKind;
  spellSpeed: 0 | 1 | 2 | 3;
  mandatory: boolean;
  oncePerTurn: boolean;
  oncePerDuel: boolean;
  fromHand: boolean;
  fromGY: boolean;
  fromBanished: boolean;
  damageStep: "except" | "allowed" | "unknown";
  negatesActivation: boolean;
  negatesEffect: boolean;
  targets: boolean;
  whenVsIf: "when" | "if" | null;
};

export type CardRole =
  | "handtrap"
  | "board-breaker"
  | "floodgate"
  | "starter"
  | "extender"
  | "searcher"
  | "negation"
  | "protection"
  | "grave-setup"
  | "normal"
  | "extra-deck";

const QUOTE_RE = /"([^"]+)"/g;

export function extractQuotes(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(QUOTE_RE)) {
    const q = match[1].trim();
    const key = q.toLowerCase();
    if (!q || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

export function isCounterTrap(card: CompactCard) {
  return (
    card.type.toLowerCase().includes("trap") &&
    (card.type.toLowerCase().includes("counter") || card.race?.toLowerCase() === "counter")
  );
}

export function isQuickPlaySpell(card: CompactCard) {
  return (
    card.type.toLowerCase().includes("spell") &&
    (card.type.toLowerCase().includes("quick") || card.race?.toLowerCase() === "quick-play")
  );
}

export function isTrap(card: CompactCard) {
  return card.type.toLowerCase().includes("trap");
}

export function isSpell(card: CompactCard) {
  return card.type.toLowerCase().includes("spell");
}

export function isMonster(card: CompactCard) {
  return !isSpell(card) && !isTrap(card);
}

export function cardActivationSpeed(card: CompactCard): 0 | 1 | 2 | 3 {
  if (isCounterTrap(card)) return 3;
  if (isTrap(card) || isQuickPlaySpell(card)) return 2;
  if (isSpell(card)) return 1;
  return 0;
}

function splitEffects(desc: string): string[] {
  const cleaned = desc.replace(/\r/g, "").trim();
  if (!cleaned) return [];
  // Pendulum cards often use [ Pendulum Effect ] / [ Monster Effect ]
  const parts = cleaned
    .split(
      /\n(?=●)|(?<=\.)\s+(?=[A-Z“"]|If |When |During |You can |Must |Cannot |This |Once |Quick |At the )|\n(?=If |When |During |You can |Once per |At the )/g,
    )
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length > 1) return parts;
  return cleaned
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function classifyClause(text: string, card: CompactCard): ParsedClause {
  const colon = text.indexOf(":");
  const semi = text.indexOf(";");
  let condition: string | undefined;
  let cost: string | undefined;
  let resolution = text;

  if (colon >= 0 && (semi < 0 || colon < semi)) {
    condition = text.slice(0, colon).trim();
    const rest = text.slice(colon + 1).trim();
    const semi2 = rest.indexOf(";");
    if (semi2 >= 0) {
      cost = rest.slice(0, semi2).trim();
      resolution = rest.slice(semi2 + 1).trim();
    } else {
      resolution = rest;
    }
  } else if (semi >= 0) {
    cost = text.slice(0, semi).trim();
    resolution = text.slice(semi + 1).trim();
  }

  const lower = text.toLowerCase();
  const condLower = (condition ?? "").toLowerCase();
  const hasColonOrSemi = colon >= 0 || semi >= 0;
  const quick =
    lower.includes("(quick effect)") ||
    lower.includes("this is a quick effect") ||
    condLower.includes("during either player's") ||
    condLower.includes("quick effect");
  const duringMainIgnition =
    /^during (your |the )?main phase\b/.test(condLower) && !/\b(if|when)\b/.test(condLower);
  const trigger =
    !duringMainIgnition &&
    (/^(if|when|after|during the (standby|end|battle|draw)|during your (standby|end)|at the start of|at the end of)\b/.test(
      condLower,
    ) ||
      /^(if|when) /.test(condLower));
  const flip = lower.includes("flip:") || condLower.startsWith("flip") || card.type.toLowerCase().includes("flip");
  const stStayOnField =
    card.type.toLowerCase().includes("continuous") ||
    card.type.toLowerCase().includes("field") ||
    card.type.toLowerCase().includes("equip") ||
    ["continuous", "field", "equip"].includes((card.race ?? "").toLowerCase());
  const reminder = /^you can only (use|activate)\b/.test(text.trim());
  const continuous =
    reminder ||
    (!hasColonOrSemi &&
      (lower.startsWith("unaffected") ||
        lower.startsWith("cannot") ||
        lower.startsWith("this card") ||
        lower.includes("gains ") ||
        /\bgain[s]? \d+ (atk|def)/.test(lower) ||
        lower.includes("is unaffected") ||
        stStayOnField && !/^you can\b/.test(text.trim())));
  const summoning =
    lower.includes("must first be") ||
    lower.includes("cannot be normal") ||
    lower.includes("must be special summoned") ||
    /special summon this card \(from your hand\)/i.test(lower) ||
    /^\(.*from (your )?(hand|gy|extra|deck|banish)/i.test(text);

  let kind: EffectKind = "unclassified";
  if (summoning && !hasColonOrSemi) kind = "summoning";
  else if (flip) kind = "flip";
  else if (quick) kind = "quick";
  else if (trigger) kind = "trigger";
  else if (hasColonOrSemi && isMonster(card)) kind = "ignition";
  else if (hasColonOrSemi && (isSpell(card) || isTrap(card))) kind = "activation";
  else if (continuous) kind = "continuous";
  else if (isSpell(card) || isTrap(card)) kind = "activation";

  let spellSpeed: 0 | 1 | 2 | 3 = 1;
  if (kind === "continuous" || kind === "summoning") spellSpeed = 0;
  else if (kind === "unclassified" && !hasColonOrSemi && isMonster(card)) spellSpeed = 0;
  else if (kind === "quick") spellSpeed = 2;
  else if (kind === "activation") spellSpeed = cardActivationSpeed(card) || 1;
  else if (kind === "trigger" || kind === "ignition" || kind === "flip") {
    // Trap / QP “When/If … :” lines are still card activations at SS2/3.
    if (isCounterTrap(card)) spellSpeed = 3;
    else if (isTrap(card) || isQuickPlaySpell(card)) spellSpeed = 2;
    else spellSpeed = 1;
  } else if (isCounterTrap(card)) spellSpeed = 3;
  else if (isTrap(card) || isQuickPlaySpell(card)) spellSpeed = 2;

  // Counter trap activation always SS3 even if classified activation
  if (isCounterTrap(card) && (kind === "activation" || kind === "unclassified" || kind === "trigger")) spellSpeed = 3;

  const mandatory =
    hasColonOrSemi &&
    !/^you can\b/i.test((condition ?? "").trim()) &&
    !/^you can\b/i.test((resolution ?? "").trim()) &&
    !/\byou can\b/i.test(condition ?? "") &&
    (kind === "trigger" || kind === "flip") &&
    !lower.startsWith("you can");

  const fromHand =
    /activate this card from your hand|discard this card|send this card from your hand|reveal this card in your hand|if this card is in your hand|while this card is in your hand/.test(
      lower,
    );
  const fromGY =
    /banish this card from your gy|this card from your gy|if this card is in your gy|while this card is in (your |the )?gy|activate this card from your gy/.test(
      lower,
    );
  const fromBanished = /while this card is banished|this banished card|if this card is banished/.test(lower);

  return {
    raw: text,
    condition,
    cost,
    resolution,
    kind,
    spellSpeed,
    mandatory: Boolean(mandatory && !/^you can/i.test(text.trim())),
    oncePerTurn:
      /once per turn/i.test(text) ||
      /only (activate|use) (this|each) (card|effect)/i.test(text) ||
      /only activate 1 /i.test(text),
    oncePerDuel: /once per duel/i.test(text),
    fromHand,
    fromGY,
    fromBanished,
    damageStep: /except during the damage step/i.test(text)
      ? "except"
      : /damage step/i.test(text)
        ? "allowed"
        : "unknown",
    negatesActivation: /negate the activation/i.test(text),
    negatesEffect: /negate (that|its|the) effect/i.test(text) || /negates? its effects?/i.test(text),
    targets: /\btarget\b/i.test(text),
    whenVsIf: /^\s*when\b/i.test(condition ?? text) ? "when" : /^\s*if\b/i.test(condition ?? text) ? "if" : null,
  };
}

export function parseCard(card: CompactCard): ParsedClause[] {
  if (!card.desc) return [];
  const chunks = splitEffects(card.desc);
  const pendulumSplit = card.desc.split(/\[ Monster Effect \]/i);
  const source =
    pendulumSplit.length > 1
      ? [...splitEffects(pendulumSplit[0].replace(/\[ Pendulum Effect \]/i, "")), ...splitEffects(pendulumSplit[1])]
      : chunks;
  return source.map((chunk) => classifyClause(chunk, card));
}

export function maxSpellSpeed(card: CompactCard): 0 | 1 | 2 | 3 {
  const act = cardActivationSpeed(card);
  const clauses = parseCard(card);
  return Math.max(act, ...clauses.map((c) => c.spellSpeed)) as 0 | 1 | 2 | 3;
}

export function inferRoles(card: CompactCard, clauses = parseCard(card)): CardRole[] {
  const roles = new Set<CardRole>();
  const lower = `${card.name} ${card.desc} ${card.type}`.toLowerCase();
  if (card.type.toLowerCase().includes("normal monster") && !card.type.toLowerCase().includes("effect")) {
    roles.add("normal");
  }
  if (
    card.type.toLowerCase().includes("fusion") ||
    card.type.toLowerCase().includes("synchro") ||
    card.type.toLowerCase().includes("xyz") ||
    card.type.toLowerCase().includes("link")
  ) {
    roles.add("extra-deck");
  }
  if (clauses.some((c) => c.fromHand && (c.kind === "quick" || c.spellSpeed >= 2 || c.kind === "trigger"))) {
    roles.add("handtrap");
  }
  if (clauses.some((c) => c.negatesActivation || c.negatesEffect)) roles.add("negation");
  if (/search|add 1 .+ from your deck/i.test(card.desc)) roles.add("searcher");
  if (/special summon .+ from your (hand|deck|gy)/i.test(card.desc)) roles.add("extender");
  if (/if (this card is in your hand|you control no monsters)|you can (normal )?summon this card/i.test(lower)) {
    roles.add("starter");
  }
  if (/destroy all|return all|banish all|send all/i.test(lower)) roles.add("board-breaker");
  if (
    /neither player can|cannot (special )?summon|must attack|cannot activate cards or effects/i.test(lower) &&
    (card.type.toLowerCase().includes("continuous") || card.race?.toLowerCase() === "continuous" || card.race?.toLowerCase() === "field")
  ) {
    roles.add("floodgate");
  }
  if (/cannot be destroyed|unaffected|protect/i.test(lower)) roles.add("protection");
  if (/send .+ from your deck to the gy|mill/i.test(lower)) roles.add("grave-setup");
  return [...roles];
}
