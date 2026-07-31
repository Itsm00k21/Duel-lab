import type { CompactCard } from "@/lib/cards/types";
import { isMonster, isSpell, isTrap } from "./psct";
import type { GameState, PlayerId, ZoneCard, ZoneRef } from "@/lib/game/types";

export type CostSource = "hand" | "field" | "gy" | "self";

export type CostSpec = {
  id: string;
  kind: "discard" | "send" | "tribute" | "banish" | "pay-lp" | "detach";
  count: number;
  minCount?: number;
  maxCount?: number;
  /** Pay exactly this LP, or half (ceil). */
  lp?: number;
  halfLp?: boolean;
  source: CostSource | "hand-or-field";
  self: boolean;
  otherOnly: boolean;
  typeHint: "monster" | "spell" | "trap" | "spell-trap" | "any";
  label: string;
};

function num(raw?: string) {
  if (!raw) return 1;
  const t = raw.toLowerCase();
  if (t === "two" || t === "2") return 2;
  if (t === "three" || t === "3") return 3;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function parseActivationCosts(text: string): CostSpec[] {
  const flat = (text || "").replace(/\s+/g, " ").trim();
  if (!flat) return [];
  const out: CostSpec[] = [];
  let i = 0;
  const push = (spec: Omit<CostSpec, "id">) => {
    out.push({ ...spec, id: `${spec.kind}-${i++}` });
  };

  if (/\bdiscard this card\b/i.test(flat) || /\bsend this card from your hand to the (gy|graveyard)\b/i.test(flat)) {
    push({
      kind: /banish this card/.test(flat.toLowerCase()) ? "banish" : "discard",
      count: 1,
      source: "self",
      self: true,
      otherOnly: false,
      typeHint: "any",
      label: "Discard this card",
    });
  }

  const discardOther = flat.match(/\bdiscard(?:ing)? (\d+|a|an|one|two|three)(?! this card)(?: other)?(?: card)?(?:s)?\b(?![^.;]{0,20}this card)/i);
  const discardN = flat.match(/\bdiscard(?:ing)? (\d+|a|an|one|two|three)(?! this) (?:other )?((?:monster|spell|trap) )?cards?\b/i);
  if (!out.some((c) => c.self && c.kind === "discard") && (discardN || discardOther || /\bdiscard(?:ing)? 1 card\b/i.test(flat))) {
    const m = discardN || discardOther;
    const typeHint = /spell/i.test(m?.[2] ?? "") ? "spell" : /trap/i.test(m?.[2] ?? "") ? "trap" : /monster/i.test(m?.[2] ?? "") ? "monster" : "any";
    push({
      kind: "discard",
      count: num(m?.[1] ?? "1"),
      source: "hand",
      self: false,
      otherOnly: /other/i.test(flat),
      typeHint,
      label: `Discard ${num(m?.[1] ?? "1")}${typeHint !== "any" ? ` ${typeHint}` : ""}`,
    });
  }

  if (/\btribute this card\b/i.test(flat)) {
    push({
      kind: "tribute",
      count: 1,
      source: "self",
      self: true,
      otherOnly: false,
      typeHint: "monster",
      label: "Tribute this card",
    });
  } else if (/\btribute (\d+|a|an|one|two|three)\b/i.test(flat)) {
    const m = flat.match(/\btribute (\d+|a|an|one|two|three)/i);
    const handOrField = /from (?:your )?(?:hand or field|field or hand|hand \/ field)/i.test(flat);
    push({
      kind: "tribute",
      count: num(m?.[1]),
      source: handOrField ? "hand-or-field" : "field",
      self: false,
      otherOnly: false,
      typeHint: "monster",
      label: handOrField ? `Tribute ${num(m?.[1])} from hand or field` : `Tribute ${num(m?.[1])}`,
    });
  }

  if (/\bbanish this card from (?:your )?(gy|graveyard)\b/i.test(flat)) {
    push({
      kind: "banish",
      count: 1,
      source: "self",
      self: true,
      otherOnly: false,
      typeHint: "any",
      label: "Banish this card from GY",
    });
  } else if (/\bbanish (\d+|a|an|one)(?: card)? from (?:your )?(gy|graveyard)\b/i.test(flat)) {
    const m = flat.match(/\bbanish (\d+|a|an|one)/i);
    push({
      kind: "banish",
      count: num(m?.[1]),
      source: "gy",
      self: false,
      otherOnly: false,
      typeHint: "any",
      label: `Banish ${num(m?.[1])} from GY`,
    });
  }

  if (/\bsend(?:ing)? up to (\d+|two|three) (?:other )?(?:spell\/traps?|spells?\/traps?|spells? and traps?|spells?|traps?|cards?)/i.test(flat) && /hand/i.test(flat) && /field/i.test(flat)) {
    const m = flat.match(/\bup to (\d+|two|three)\b/i);
    const n = num(m?.[1] ?? "2");
    const hintRaw = flat.match(/up to (?:\d+|two|three) (spell\/traps?|spells?\/traps?|spells? and traps?|spells?|traps?)/i)?.[1] ?? "";
    const typeHint: CostSpec["typeHint"] = /spell\/trap|spells?\/traps?|spells? and traps?/i.test(hintRaw)
      ? "spell-trap"
      : /trap/i.test(hintRaw)
        ? "trap"
        : /spell/i.test(hintRaw)
          ? "spell"
          : "any";
    push({
      kind: "send",
      count: n,
      minCount: 1,
      maxCount: n,
      source: "hand-or-field",
      self: false,
      otherOnly: true,
      typeHint,
      label: `Send up to ${n}${typeHint !== "any" ? ` ${typeHint}` : ""} from hand/field`,
    });
  } else if (/\bsend(?:ing)? (\d+|a|an|one)(?: other)? cards? from your hand or field to the (gy|graveyard)\b/i.test(flat)) {
    const m = flat.match(/\bsend(?:ing)? (\d+|a|an|one)/i);
    push({
      kind: "send",
      count: num(m?.[1]),
      source: "hand-or-field",
      self: false,
      otherOnly: /other/i.test(flat) || /special summon this card/i.test(flat),
      typeHint: "any",
      label: "Send 1 card from hand or field",
    });
  } else if (/\bsend any number of other cards from your hand and\/or field to the (gy|graveyard)\b/i.test(flat)) {
    push({
      kind: "send",
      count: 5,
      minCount: 1,
      maxCount: 5,
      source: "hand-or-field",
      self: false,
      otherOnly: true,
      typeHint: "any",
      label: "Send any number from hand/field (min 1)",
    });
  } else if (/\bsend this card from your hand\b/i.test(flat) && !out.some((c) => c.self)) {
    push({
      kind: "send",
      count: 1,
      source: "self",
      self: true,
      otherOnly: false,
      typeHint: "any",
      label: "Send this card from hand to GY",
    });
  }

  const pay = flat.match(/\bpay (\d{2,5}) lp\b/i);
  if (pay) {
    push({
      kind: "pay-lp",
      count: 0,
      lp: Number(pay[1]),
      source: "self",
      self: false,
      otherOnly: false,
      typeHint: "any",
      label: `Pay ${pay[1]} LP`,
    });
  } else if (/\bpay half (?:your |of your )?lp\b/i.test(flat)) {
    push({
      kind: "pay-lp",
      count: 0,
      halfLp: true,
      source: "self",
      self: false,
      otherOnly: false,
      typeHint: "any",
      label: "Pay half LP",
    });
  }

  if (/\bdetach (\d+|a|an|one|two)\b/i.test(flat)) {
    const m = flat.match(/\bdetach (\d+|a|an|one|two)/i);
    push({
      kind: "detach",
      count: num(m?.[1]),
      source: "self",
      self: true,
      otherOnly: false,
      typeHint: "any",
      label: `Detach ${num(m?.[1])}`,
    });
  }

  return out;
}

export function typeOk(card: CompactCard, hint: CostSpec["typeHint"]) {
  if (hint === "any") return true;
  if (hint === "monster") return isMonster(card);
  if (hint === "spell") return isSpell(card);
  if (hint === "trap") return isTrap(card);
  if (hint === "spell-trap") return isSpell(card) || isTrap(card);
  return true;
}

export function costCandidates(
  state: GameState,
  owner: PlayerId,
  spec: CostSpec,
  selfInstanceId: string | undefined,
  byId: Map<number, CompactCard>,
): Array<{ card: ZoneCard; data?: CompactCard; ref: ZoneRef; label: string }> {
  const p = state.players[owner];
  const out: Array<{ card: ZoneCard; data?: CompactCard; ref: ZoneRef; label: string }> = [];
  const add = (card: ZoneCard, ref: ZoneRef, where: string) => {
    if (spec.otherOnly && card.instanceId === selfInstanceId) return;
    if (spec.self && card.instanceId !== selfInstanceId) return;
    const data = byId.get(card.cardId);
    if (data && !typeOk(data, spec.typeHint)) return;
    out.push({ card, data, ref, label: `${data?.name ?? card.name ?? "Card"} · ${where}` });
  };

  if (spec.source === "self" || spec.source === "hand" || spec.source === "hand-or-field") {
    p.hand.forEach((card, index) => add(card, { owner, zone: "hand", index }, "hand"));
  }
  if (spec.source === "field" || spec.source === "hand-or-field" || spec.source === "self") {
    p.monsters.forEach((card, index) => {
      if (card) add(card, { owner, zone: "monster", index }, "field");
    });
    p.spells.forEach((card, index) => {
      if (card && spec.kind !== "tribute") add(card, { owner, zone: "st", index }, "S/T");
    });
    if (p.field && spec.kind !== "tribute") add(p.field, { owner, zone: "field" }, "Field");
  }
  if (spec.source === "gy" || (spec.source === "self" && spec.kind === "banish")) {
    p.gy.forEach((card, index) => add(card, { owner, zone: "gy", index }, "GY"));
  }
  return out;
}

export function canPayCost(
  state: GameState,
  owner: PlayerId,
  spec: CostSpec,
  selfInstanceId: string | undefined,
  byId: Map<number, CompactCard>,
): boolean {
  if (spec.kind === "pay-lp") {
    const lp = state.players[owner].lp;
    const need = spec.halfLp ? Math.ceil(lp / 2) : (spec.lp ?? 0);
    return lp >= need && need > 0;
  }
  if (spec.kind === "detach") {
    const all = [
      ...state.players[owner].monsters,
      ...state.emz,
    ].filter(Boolean) as ZoneCard[];
    const self = all.find((c) => c.instanceId === selfInstanceId) ?? all.find((c) => c.overlay.length >= spec.count);
    return Boolean(self && self.overlay.length >= spec.count);
  }
  const cands = costCandidates(state, owner, spec, selfInstanceId, byId);
  if (spec.self) return Boolean(selfInstanceId) || cands.length > 0;
  const need = spec.minCount ?? spec.count;
  if (spec.kind === "tribute" && spec.source === "field" && selfInstanceId) {
    return cands.length >= need;
  }
  return cands.length >= need;
}

export function canPayAllCosts(
  state: GameState,
  owner: PlayerId,
  costs: CostSpec[],
  selfInstanceId: string | undefined,
  byId: Map<number, CompactCard>,
) {
  return costs.every((c) => canPayCost(state, owner, c, selfInstanceId, byId));
}
