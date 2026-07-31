import type { GameState, PlayerId, ZoneCard } from "@/lib/game/types";

function hideCard(card: ZoneCard, keepFace: boolean): ZoneCard {
  if (keepFace && card.faceUp) return card;
  return {
    ...card,
    cardId: keepFace ? card.cardId : 0,
    name: keepFace ? card.name : undefined,
    faceUp: keepFace ? card.faceUp : false,
    overlay: (card.overlay ?? []).map((c) => hideCard(c, false)),
  };
}

/** Fog of war: you never see the opponent's hand/deck/ED, or face-down cards. */
export function sanitizeState(state: GameState, seat: PlayerId): GameState {
  const opp: PlayerId = seat === "p1" ? "p2" : "p1";
  const o = state.players[opp];
  return {
    ...state,
    view: seat,
    pvp: { ...(state.pvp ?? { roomCode: "" }), seat },
    players: {
      ...state.players,
      [opp]: {
        ...o,
        hand: o.hand.map((c) => hideCard(c, false)),
        deck: o.deck.map((c) => hideCard({ ...c, faceUp: false }, false)),
        extra: o.extra.map((c) => hideCard(c, false)),
        side: o.side.map((c) => hideCard(c, false)),
        monsters: o.monsters.map((c) => (c ? hideCard(c, c.faceUp) : null)),
        spells: o.spells.map((c) => (c ? hideCard(c, c.faceUp) : null)),
        field: o.field ? hideCard(o.field, o.field.faceUp) : null,
        banish: o.banish.map((c) => hideCard(c, c.faceUp)),
      },
    },
    emz: [
      state.emz[0] ? hideCard(state.emz[0], state.emz[0].faceUp) : null,
      state.emz[1] ? hideCard(state.emz[1], state.emz[1].faceUp) : null,
    ],
  };
}
