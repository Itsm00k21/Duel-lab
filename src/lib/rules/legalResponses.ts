import type { CompactCard } from "@/lib/cards/types";
import type { GameState, PlayerId, ZoneCard } from "@/lib/game/types";
import { activationOptions, type ActLoc, type ActivationOption } from "./activationWindow";
import { isMonster, isQuickPlaySpell, isSpell, isTrap } from "./psct";
import { isOneShotSpellTrap } from "./stLifecycle";

export type LegalResponseRow = {
  card: ZoneCard;
  data: CompactCard;
  opt: ActivationOption;
  where: "hand" | "field" | "st" | "gy";
  loc: ActLoc;
};

export function isLegalChainResponseOpt(
  data: CompactCard,
  opt: ActivationOption,
  where: LegalResponseRow["where"],
  zoneCard?: ZoneCard,
): boolean {
  if (opt.mode === "card") {
    const qp = isQuickPlaySpell(data);
    const trapHand = isTrap(data) && /activate this card from your hand/i.test(data.desc);
    if (where === "hand" && isSpell(data) && !qp) return false;
    if (where === "hand" && isTrap(data) && !trapHand) return false;
    if (where === "hand" && isMonster(data)) return false;
    if ((where === "st" || where === "field") && zoneCard?.faceUp) return false;
    return true;
  }
  if (where === "hand" && (isSpell(data) || isTrap(data))) return false;
  if (opt.spellSpeed < 2 && opt.kind !== "quick") return false;
  return true;
}

export function collectLegalResponses(
  state: GameState,
  self: PlayerId,
  byId: Map<number, CompactCard>,
): LegalResponseRow[] {
  if (!state.chain.links.length || state.chain.complete) return [];
  if (state.chain.pendingPlayer && state.chain.pendingPlayer !== self) return [];
  const me = state.players[self];
  const out: LegalResponseRow[] = [];
  const onChain = new Set(state.chain.links.map((l) => l.instanceId).filter(Boolean) as string[]);
  const consider = (card: ZoneCard | null | undefined, where: LegalResponseRow["where"], loc: ActLoc) => {
    if (!card) return;
    if (onChain.has(card.instanceId)) return;
    const data = byId.get(card.cardId);
    if (!data) return;
    if ((where === "st" || where === "field") && card.faceUp && isOneShotSpellTrap(data)) return;
    for (const opt of activationOptions(state, data, card, loc, self, byId)) {
      if (!isLegalChainResponseOpt(data, opt, where, card)) continue;
      out.push({ card, data, opt, where, loc });
    }
  };
  for (const c of me.hand) consider(c, "hand", "hand");
  for (const c of me.monsters) consider(c, "field", "field");
  for (const c of me.spells) consider(c, "st", "st");
  consider(me.field, "st", "st");
  for (const c of me.gy.slice(0, 12)) consider(c, "gy", "gy");
  return out;
}
