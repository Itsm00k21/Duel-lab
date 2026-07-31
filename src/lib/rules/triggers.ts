import type { CompactCard } from "@/lib/cards/types";
import type { GameState, PlayerId, ZoneCard } from "@/lib/game/types";
import { parseCard, type ParsedClause } from "./psct";
import { parseAllSearchSpecs, parseSearchSpec, type SearchSpec } from "./searchEffect";
import { effectAlreadyUsed, isCardActivationTrigger, isOptReminderClause } from "./effectOpt";
import { evaluateResponse } from "./responseGate";
import {
  conditionMatchesEvent,
  conditionText,
  eventLabel,
  type DuelEvent,
} from "./triggerMatch";

export type { DuelEvent } from "./triggerMatch";

export type TriggerPrompt = {
  id: string;
  owner: PlayerId;
  instanceId?: string;
  cardId: number;
  cardName: string;
  clauseIndex: number;
  summary: string;
  eventLabel: string;
  mandatory: boolean;
  spellSpeed: 1 | 2;
  kind: string;
  /** If the effect sets a named card from Deck (e.g. Magician's Salvation). */
  setFromDeck?: string;
  search?: SearchSpec;
};

function parseSetFromDeck(text: string): string | undefined {
  const m = text.match(/set 1 "([^"]+)"(?:[^."\n]{0,60})from your deck/i);
  return m?.[1];
}

type Loc = "field" | "gy" | "hand" | "banish" | "st";

function allowedLoc(clause: ParsedClause, loc: Loc, selfEvent: boolean, isEventCard: boolean) {
  const cond = conditionText(clause);
  const blob = `${cond} ${clause.cost ?? ""} ${clause.raw}`.toLowerCase();
  const fromGY =
    clause.fromGY ||
    /this card from (your |the )?gy|if this card is in (your |the )?gy|while this card is in (your |the )?gy|add this card from (your |the )?gy/.test(
      blob,
    );
  const fromHand =
    clause.fromHand || /from your hand|in your hand|discard this card|send this card from your hand/.test(blob);
  const fromBanish =
    clause.fromBanished || /banished.?this card|this banished card|while this card is banished/.test(blob);

  if (loc === "gy") return fromGY || (selfEvent && isEventCard);
  if (loc === "hand") return fromHand;
  if (loc === "banish") return fromBanish || (selfEvent && isEventCard);
  if (loc === "st") return !fromGY && !fromHand;
  if (loc === "field") return !fromGY && !fromHand && !fromBanish;
  return false;
}

export function findTriggerPrompts(
  state: GameState,
  byId: Map<number, CompactCard>,
  event: DuelEvent,
): TriggerPrompt[] {
  const out: TriggerPrompt[] = [];

  const consider = (owner: PlayerId, zoneCard: ZoneCard, loc: Loc) => {
    if (zoneCard.isToken) return;
    const data = byId.get(zoneCard.cardId);
    if (!data) return;
    const isEventCard =
      Boolean(event.instanceId && zoneCard.instanceId === event.instanceId) ||
      Boolean(
        event.cardId &&
          zoneCard.cardId === event.cardId &&
          (event.type === "sent-gy" ||
            event.type === "banish" ||
            event.type === "flip" ||
            event.type === "summon" ||
            event.type === "activation"),
      );

    const clauses = parseCard(data);
    clauses.forEach((clause, clauseIndex) => {
      const cond = conditionText(clause);
      if (!cond) return;
      if (isOptReminderClause(clause) || isCardActivationTrigger(clause)) return;
      if (effectAlreadyUsed(state, owner, data, zoneCard, clauseIndex, clause)) return;
      if (!conditionMatchesEvent(clause, event, { owner, isEventCard })) return;
      if (event.type === "activation" && event.cardId) {
        const evCard = byId.get(event.cardId);
        const fakeTop = {
          id: "ev",
          link: state.chain.links.length || 1,
          player: (event.controller ?? event.player ?? owner) as PlayerId,
          cardId: event.cardId,
          cardName: evCard?.name ?? "Card",
          spellSpeed: 1 as const,
          kind: "activation",
          label: evCard?.name ?? "",
          clauseIndex: undefined,
        };
        const gate = evaluateResponse(data, clause, fakeTop, evCard, owner);
        if (gate.gate && !gate.ok) return;
      }
      if (!allowedLoc(clause, loc, /\bthis card\b/.test(cond), isEventCard)) return;

      // Face-down field monsters don't use trigger effects (except flip later).
      if (loc === "field" && !zoneCard.faceUp && event.type !== "flip") return;
      // Set ST may trigger (Torrential etc.).
      if (loc === "st" && !zoneCard.faceUp && !/summon|activat/.test(cond)) return;

      const speed: 1 | 2 = clause.spellSpeed === 2 ? 2 : 1;
      const blob = clause.resolution || clause.raw;
      const setFromDeck = parseSetFromDeck(`${clause.resolution} ${clause.raw}`);
      const searches = parseAllSearchSpecs(blob);
      const search = searches[0] ?? parseSearchSpec(data.desc) ?? undefined;
      out.push({
        id: `${zoneCard.instanceId}:${clauseIndex}:${event.type}:${event.phase ?? ""}`,
        owner,
        instanceId: zoneCard.instanceId,
        cardId: data.id,
        cardName: data.name,
        clauseIndex,
        summary: searches.length
          ? searches.map((s) => s.label).join(" → ")
          : search
            ? search.label
            : setFromDeck
              ? `Set 1 "${setFromDeck}" from the Deck?`
              : (clause.condition || clause.raw).slice(0, 220),
        eventLabel: eventLabel(event),
        mandatory: clause.mandatory,
        spellSpeed: speed,
        kind: clause.kind,
        setFromDeck,
        search,
      });
    });
  };

  for (const owner of ["p1", "p2"] as PlayerId[]) {
    const p = state.players[owner];
    for (const card of p.monsters) if (card) consider(owner, card, "field");
    for (const card of p.spells) if (card) consider(owner, card, "st");
    if (p.field) consider(owner, p.field, "st");
    // GY: only self-moving card or genuine GY trigger watchers / self GY triggers
    for (const card of p.gy) consider(owner, card, "gy");
    for (const card of p.hand) consider(owner, card, "hand");
    for (const card of p.banish) consider(owner, card, "banish");
  }
  for (const card of state.emz) {
    if (card) consider(event.controller ?? state.activePlayer, card, "field");
  }

  const tp = state.activePlayer;
  const rank = (p: TriggerPrompt) => (p.owner === tp ? 0 : 1) + (p.mandatory ? 0 : 2);

  const seen = new Set<string>();
  return out
    .filter((p) => {
      const key = `${p.owner}:${p.cardId}:${p.clauseIndex}:${p.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => rank(a) - rank(b) || a.cardName.localeCompare(b.cardName));
}
