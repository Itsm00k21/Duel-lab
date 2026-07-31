import type { CompactCard } from "@/lib/cards/types";
import type { ChainLink } from "./chain";
import type { EffectInclude, EffectProfile } from "./effectProfile";
import { parseIncludesFromText, profileCardActivation, profileEffectText } from "./effectProfile";
import type { ParsedClause } from "./psct";

export type ResponseGate = {
  /** null gate = no include restriction (normal fast effect). */
  kind: "includes-any" | "any-activation" | "opponent-activation";
  includes: EffectInclude[];
  opponentOnly: boolean;
  /** Belle negates activation; Ash negates effect. */
  negates: "activation" | "effect" | null;
  label: string;
};

export function parseResponseGate(card: CompactCard, clause?: ParsedClause | null): ResponseGate | null {
  const desc = card.desc ?? "";
  const cond = `${clause?.condition ?? ""} ${clause?.raw ?? ""} ${desc}`.toLowerCase();
  const activationWatch =
    /when a card or effect is activated/.test(cond) ||
    /if a card or effect is activated/.test(cond) ||
    /when your opponent activates/.test(cond) ||
    /if your opponent activates/.test(cond);
  if (!activationWatch) return null;

  const opponentOnly = /your opponent activates/.test(cond);
  const negates: ResponseGate["negates"] = /negate that activation/.test(cond)
    ? "activation"
    : /negate that effect/.test(cond)
      ? "effect"
      : clause?.negatesActivation
        ? "activation"
        : clause?.negatesEffect
          ? "effect"
          : null;

  if (/includes any of these effects/.test(cond) || /includes any of these effects/.test(desc.toLowerCase())) {
    const bullets = [...desc.matchAll(/[●•]\s*([^\n●•]+)/g)].map((m) => m[1]!.trim());
    const includes = bullets.length
      ? [...new Set(bullets.flatMap((b) => parseIncludesFromText(expandBullet(b))))]
      : parseIncludesFromText(desc);
    return {
      kind: "includes-any",
      includes,
      opponentOnly,
      negates,
      label: `${card.name} only responds to: ${includes.join(", ") || "listed includes"}`,
    };
  }

  return {
    kind: opponentOnly ? "opponent-activation" : "any-activation",
    includes: [],
    opponentOnly,
    negates,
    label: opponentOnly ? `${card.name} responds to an opponent's activation` : `${card.name} responds to a card/effect activation`,
  };
}

/** Belle bullet "Add a card(s) from the GY to the hand, Deck, or Extra Deck." */
function expandBullet(bullet: string): string {
  const b = bullet.replace(/\s+/g, " ").trim();
  if (/from the gy to the hand, deck, or extra deck/i.test(b) || /from the graveyard to the hand, deck, or extra deck/i.test(b)) {
    return [
      "Add a card from the GY to the hand",
      "Add a card from the GY to the Deck",
      "Add a card from the GY to the Extra Deck",
    ].join(". ");
  }
  if (/special summon(?: a monster card\(s\))? from the gy/i.test(b)) {
    return "Special Summon a monster from the GY";
  }
  if (/banish a card\(s\) from the gy/i.test(b)) return "Banish a card from the GY";
  if (/add a card from the deck to the hand/i.test(b)) return "Add a card from the Deck to the hand";
  if (/special summon from the deck/i.test(b)) return "Special Summon a monster from the Deck";
  if (/send a card from the deck to the gy/i.test(b)) return "Send a card from the Deck to the GY";
  return b;
}

export function gateAllows(
  gate: ResponseGate,
  top: { player: string; profile: EffectProfile },
  responderOwner: string,
): { ok: boolean; reason: string } {
  if (gate.opponentOnly && top.player === responderOwner) {
    return { ok: false, reason: `${gate.label} — opponent's activation only.` };
  }
  if (gate.kind === "any-activation" || gate.kind === "opponent-activation") {
    return { ok: true, reason: gate.label };
  }
  const hit = gate.includes.filter((inc) => top.profile.includes.includes(inc));
  if (!hit.length) {
    return {
      ok: false,
      reason: `${gate.label}. Current effect includes [${top.profile.includes.join(", ") || "none"}], so this is not a legal response.`,
    };
  }
  return { ok: true, reason: `Legal: chain includes ${hit.join(", ")}.` };
}

export function evaluateResponse(
  responder: CompactCard,
  clause: ParsedClause | null | undefined,
  top: ChainLink | undefined,
  topCard: CompactCard | undefined,
  responderOwner: string,
): { ok: boolean; reason: string; gate: ResponseGate | null; profile: EffectProfile | null } {
  const gate = parseResponseGate(responder, clause);
  if (!top) {
    if (!gate) return { ok: true, reason: "No chain — not a gated response.", gate, profile: null };
    return { ok: false, reason: "Needs a card/effect activation to respond to.", gate, profile: null };
  }
  const profile =
    top.includes?.length
      ? { text: top.clauseText || top.label || "", includes: top.includes as EffectInclude[] }
      : topCard
        ? profileCardActivation(topCard, top.clauseIndex)
        : profileEffectText(top.clauseText || top.label || top.cardName);
  if (!gate) return { ok: true, reason: "No include-gate on this card.", gate: null, profile };
  return { ...gateAllows(gate, { player: top.player, profile }, responderOwner), gate, profile };
}
