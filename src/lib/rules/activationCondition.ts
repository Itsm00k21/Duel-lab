import type { CompactCard } from "@/lib/cards/types";
import type { GameState, PlayerId, ZoneCard } from "@/lib/game/types";
import { type ParsedClause } from "./psct";

type ActLoc = "hand" | "field" | "st" | "gy" | "banish" | "extra" | "deck";

function other(id: PlayerId): PlayerId {
  return id === "p1" ? "p2" : "p1";
}

function condOf(clause: ParsedClause) {
  return (clause.condition ?? "").toLowerCase();
}

function blob(clause: ParsedClause) {
  return `${clause.condition ?? ""} ${clause.cost ?? ""} ${clause.resolution} ${clause.raw}`.toLowerCase();
}

function isNormalMonster(data?: CompactCard) {
  if (!data) return false;
  const t = data.type.toLowerCase();
  return t.includes("monster") && /\bnormal\b/.test(t) && !/\beffect\b/.test(t);
}

function isEffectMonster(data?: CompactCard) {
  if (!data) return false;
  const t = data.type.toLowerCase();
  if (!t.includes("monster")) return false;
  if (/\bnormal\b/.test(t) && !/\beffect\b/.test(t)) return false;
  return true;
}

function matchesQuote(data: CompactCard | undefined, quote: string) {
  if (!data) return false;
  const q = quote.toLowerCase();
  const name = data.name.toLowerCase();
  const arch = (data.archetype ?? "").toLowerCase();
  const treated = (data.treatedAs ?? "").toLowerCase();
  return name.includes(q) || arch === q || arch.includes(q) || treated.includes(q);
}

function faceUpCards(state: GameState, owner: PlayerId): ZoneCard[] {
  const p = state.players[owner];
  return [...p.monsters.filter(Boolean), ...p.spells.filter(Boolean), p.field].filter(Boolean) as ZoneCard[];
}

export function conditionOk(
  clause: ParsedClause,
  state: GameState,
  owner: PlayerId,
  loc: ActLoc,
  byId: Map<number, CompactCard>,
): { ok: boolean; reason: string } | null {
  const condOnly = condOf(clause);
  const full = blob(clause);
  const cond = condOnly || full;
  const p = state.players[owner];
  const opp = state.players[other(owner)];

  if (/if you control no cards|while you control no cards/.test(cond)) {
    const total = p.monsters.filter(Boolean).length + p.spells.filter(Boolean).length + (p.field ? 1 : 0);
    return total === 0 ? { ok: true, reason: "You control no cards." } : { ok: false, reason: "You control cards." };
  }
  if (/if you control no monsters|while you control no monsters/.test(cond)) {
    return p.monsters.filter(Boolean).length === 0
      ? { ok: true, reason: "You control no monsters." }
      : { ok: false, reason: "You still control a monster." };
  }
  if (/only your opponent controls a monster/.test(cond)) {
    const mine = p.monsters.filter(Boolean).length === 0;
    const theirs = opp.monsters.filter(Boolean).length > 0;
    return mine && theirs
      ? { ok: true, reason: "Only opponent controls a monster." }
      : { ok: false, reason: "Needs only the opponent to control a monster." };
  }

  const controlQuote = condOnly.match(/you control (?:an? )?["“]([^"”]+)["”]/i);
  if (controlQuote?.[1]) {
    const q = controlQuote[1];
    const ok = faceUpCards(state, owner).some((c) => c.faceUp && matchesQuote(byId.get(c.cardId), q));
    return ok
      ? { ok: true, reason: `You control "${q}".` }
      : { ok: false, reason: `You do not control "${q}".` };
  }

  if (/normal monster in (?:your )?(?:the )?field or (?:your |the )?gy|normal monster in your field or gy/.test(cond)) {
    const fieldNm = p.monsters.some((c) => c?.faceUp && isNormalMonster(byId.get(c.cardId)));
    const gyNm = p.gy.some((c) => isNormalMonster(byId.get(c.cardId)));
    return fieldNm || gyNm
      ? { ok: true, reason: "Normal Monster in field or GY." }
      : { ok: false, reason: "No Normal Monster in field or GY." };
  }

  if (
    (/if you control a monster|while you control (?:a|1) monster/.test(cond) || /if you control an? ["“]/.test(condOnly)) &&
    !/no monster/.test(cond) &&
    !controlQuote
  ) {
    if (/if you control a monster|while you control (?:a|1) monster/.test(cond)) {
      return p.monsters.filter(Boolean).length > 0
        ? { ok: true, reason: "You control a monster." }
        : { ok: false, reason: "You control no monsters." };
    }
  }

  if (/if your opponent controls a monster|while your opponent controls/.test(cond)) {
    if (/no monster/.test(cond)) {
      return opp.monsters.filter(Boolean).length === 0
        ? { ok: true, reason: "Opponent controls no monsters." }
        : { ok: false, reason: "Opponent still controls a monster." };
    }
    return opp.monsters.filter(Boolean).length > 0
      ? { ok: true, reason: "Opponent controls a monster." }
      : { ok: false, reason: "Opponent controls no monsters." };
  }

  if (/\btarget 1 (?:face-up )?effect monster your opponent controls\b/i.test(full)) {
    const n = opp.monsters.filter((c) => c?.faceUp && isEffectMonster(byId.get(c.cardId))).length;
    return n > 0
      ? { ok: true, reason: "Opponent has a face-up Effect Monster." }
      : { ok: false, reason: "No face-up Effect Monster to target." };
  }
  if (/\btarget 1 (?:face-up )?monster your opponent controls\b/i.test(full)) {
    const n = opp.monsters.filter((c) => c?.faceUp).length;
    return n > 0
      ? { ok: true, reason: "Opponent has a face-up monster." }
      : { ok: false, reason: "No face-up monster to target." };
  }

  if (/no cards in your hand/.test(cond)) {
    const count = loc === "hand" ? p.hand.length - 1 : p.hand.length;
    return count <= 0 ? { ok: true, reason: "No other cards in hand." } : { ok: false, reason: "You still have cards in hand." };
  }

  if (/5 or more monsters this turn|summoned 5 or more/.test(cond)) {
    const n = state.summonsThisTurn[other(owner)] ?? 0;
    return n >= 5
      ? { ok: true, reason: `Opponent summoned ${n} this turn.` }
      : { ok: false, reason: `Opponent summoned ${n}/5 monsters this turn.` };
  }

  return null;
}

/** Requirements on the Spell/Trap card activation itself (targets, named cards). */
export function cardActivationRequirementsOk(
  card: CompactCard,
  state: GameState,
  owner: PlayerId,
  byId: Map<number, CompactCard>,
): { ok: boolean; reason: string } {
  const desc = (card.desc ?? "").toLowerCase();
  const p = state.players[owner];
  const opp = state.players[owner === "p1" ? "p2" : "p1"];

  if (/\btarget 1 (?:face-up )?effect monster your opponent controls\b/i.test(desc)) {
    if (!opp.monsters.some((c) => c?.faceUp && isEffectMonster(byId.get(c.cardId)))) {
      return { ok: false, reason: "No face-up Effect Monster to target." };
    }
  } else if (/\btarget 1 (?:face-up )?monster your opponent controls\b/i.test(desc)) {
    if (!opp.monsters.some((c) => c?.faceUp)) {
      return { ok: false, reason: "No face-up opponent monster to target." };
    }
  }

  if (/\btarget 1 (?:spell\/trap|spell or trap) on the field\b/i.test(desc)) {
    const anySt = [...p.spells, p.field, ...opp.spells, opp.field].some(Boolean);
    if (!anySt) return { ok: false, reason: "No Spell/Trap on the field to target." };
  }

  if (/\btarget 1 monster in your opponent'?s (?:gy|graveyard)\b/i.test(desc)) {
    const anyMon = opp.gy.some((c) => {
      const d = byId.get(c.cardId);
      if (!d) return true;
      const t = d.type.toLowerCase();
      return t.includes("monster") || (!t.includes("spell") && !t.includes("trap"));
    });
    if (!anyMon) return { ok: false, reason: "No monster in opponent's GY to target." };
  }

  if (/target 1 ["“]dark magician["”] or ["“]dark magician girl["”]/i.test(desc) || /target 1 "dark magician"/i.test(desc)) {
    const hit = [...p.monsters.filter(Boolean), ...p.gy].some((c) => {
      const d = c ? byId.get(c.cardId) : undefined;
      const n = (d?.name ?? c?.name ?? "").toLowerCase();
      return n === "dark magician" || n === "dark magician girl";
    });
    if (!hit) return { ok: false, reason: "No Dark Magician / Dark Magician Girl in your field or GY." };
  }

  const namedTarget = desc.match(/target 1 ["“]([^"”]+)["”] (?:you control|in your (?:gy|graveyard|field|hand))/i);
  if (namedTarget?.[1]) {
    const q = namedTarget[1].toLowerCase();
    const pool = /in your (gy|graveyard)/.test(desc)
      ? p.gy
      : /in your hand/.test(desc)
        ? p.hand
        : [...p.monsters.filter(Boolean), ...p.spells.filter(Boolean), p.field].filter(Boolean) as ZoneCard[];
    const ok = pool.some((c) => (byId.get(c!.cardId)?.name ?? c!.name ?? "").toLowerCase().includes(q));
    if (!ok) return { ok: false, reason: `No "${namedTarget[1]}" in the required location.` };
  }

  return { ok: true, reason: "Card activation requirements met." };
}
