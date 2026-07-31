import type { FormatId } from "@/lib/deck/formats";
import type { DeckList } from "@/lib/deck/types";
import type { ChainState, FetBox } from "@/lib/rules/chain";
import type { DuelEvent } from "@/lib/rules/triggerMatch";

export type PlayerId = "p1" | "p2";

export type ActivationTrace = {
  id: string;
  at: string;
  allowed: boolean;
  cardName: string;
  player: PlayerId;
  loc?: string;
  kind?: string;
  spellSpeed?: number;
  clauseIndex?: number;
  chainLink?: number;
  respondingTo?: string;
  reason: string;
  source: "engine" | "ui" | "bot";
};

export type Phase = "DP" | "SP" | "M1" | "BP" | "M2" | "EP";

export type CardPosition = "atk" | "def";

export type PileZone = "deck" | "hand" | "gy" | "banish" | "extra" | "side";

export type SlotZone = "monster" | "st" | "field" | "emz";

export type ZoneCard = {
  instanceId: string;
  cardId: number;
  name?: string;
  faceUp: boolean;
  position: CardPosition;
  counters: number;
  overlay: ZoneCard[];
  isToken?: boolean;
  tokenAtk?: number;
  tokenDef?: number;
  /** One-shot Spell/Trap: send to GY after the activation resolves. */
  leaveOnResolve?: "gy";
  /** Turn number this card was Set face-down (Traps / Quick-Plays cannot activate that turn). */
  setTurn?: number;
  /** Monster effects negated through end of this turn number (Imperm / Veiler). */
  effectsNegatedUntilTurn?: number;
  /** ATK halved until end of this turn (Droplet). */
  atkHalvedUntilTurn?: number;
};

export type PlayerState = {
  id: PlayerId;
  name: string;
  lp: number;
  deck: ZoneCard[];
  hand: ZoneCard[];
  gy: ZoneCard[];
  banish: ZoneCard[];
  extra: ZoneCard[];
  side: ZoneCard[];
  monsters: Array<ZoneCard | null>;
  spells: Array<ZoneCard | null>;
  field: ZoneCard | null;
};

export type LogEntry = {
  id: string;
  at: string;
  text: string;
};

export type EffectUse = {
  player: PlayerId;
  cardId: number;
  nameKey: string;
  clauseIndex: number;
  instanceId?: string;
  scope: "hard" | "soft";
};

export type GameState = {
  id: string;
  formatId: FormatId;
  turn: number;
  phase: Phase;
  activePlayer: PlayerId;
  players: Record<PlayerId, PlayerState>;
  emz: [ZoneCard | null, ZoneCard | null];
  log: LogEntry[];
  lastRoll?: { kind: "dice" | "coin"; value: string };
  notes: string;
  view: "god" | PlayerId;
  rotateOpponent?: boolean;
  chain: ChainState;
  fetBox: FetBox;
  /** Normal/Special Summons by controller this turn (resets on turn change). */
  summonsThisTurn: Record<PlayerId, number>;
  /** True after the turn's built-in Normal Summon/Set is spent. */
  normalSummonUsed: Record<PlayerId, boolean>;
  /** Extra Normal Summons granted by effects (Double Summon, etc.). */
  bonusNormalSummons: Record<PlayerId, number>;
  /** Activated card effects this turn (hard/soft once-per-turn locks). */
  effectsUsedThisTurn: EffectUse[];
  /** A Spell Card or Spell effect was activated this turn (for alt Extra Summons). */
  activatedSpellThisTurn: boolean;
  /** Original names negated until end of this turn (Crossout). */
  negatedNamesUntilTurn?: Array<{ nameKey: string; untilTurn: number }>;
  startingPlayer: PlayerId;
  drewThisTurn: Record<PlayerId, boolean>;
  attackedThisTurn: string[];
  /** Ring buffer of activation/chain attempts for Rules Debug (Bot + Friend). */
  debugTrace?: ActivationTrace[];
  /** Last game event used to gate If/When menus. */
  lastEvent?: DuelEvent;
  pve?: {
    bot: PlayerId;
    premadeId: string;
    deckName: string;
  };
  pvp?: {
    roomCode: string;
    /** Present only on each client's local session, not authoritative server copy. */
    seat?: PlayerId;
  };
  createdAt: string;
  updatedAt: string;
};

export type ZoneRef =
  | { owner: PlayerId; zone: PileZone; index?: number }
  | { owner: PlayerId; zone: "monster" | "st"; index: number }
  | { owner: PlayerId; zone: "field" }
  | { owner: "shared"; zone: "emz"; index: 0 | 1 };

export type GameAction =
  | { type: "DRAW"; player: PlayerId; count?: number }
  | { type: "MILL"; player: PlayerId; count?: number }
  | { type: "SHUFFLE"; player: PlayerId; zone: PileZone }
  | { type: "MOVE"; from: ZoneRef; to: ZoneRef; faceUp?: boolean; position?: CardPosition; manual?: boolean; player?: PlayerId }
  | { type: "FLIP"; ref: ZoneRef }
  | { type: "ROTATE"; ref: ZoneRef }
  | { type: "COUNTER"; ref: ZoneRef; delta: number }
  | { type: "SET_LP"; player: PlayerId; amount: number; mode: "set" | "delta" }
  | { type: "NEXT_PHASE" }
  | { type: "PREV_PHASE" }
  | { type: "NEXT_TURN" }
  | { type: "DICE" }
  | { type: "COIN" }
  | { type: "TOKEN"; player: PlayerId; atk?: number; def?: number; name?: string }
  | { type: "VIEW"; view: GameState["view"] }
  | { type: "NOTES"; notes: string }
  | { type: "RESET_HANDS"; draw?: number }
  | { type: "TOGGLE_ROTATE" }
  | {
      type: "CHAIN_ADD";
      player: PlayerId;
      cardId: number;
      cardName: string;
      instanceId?: string;
      spellSpeed: 1 | 2 | 3;
      kind: string;
      label: string;
      mandatory?: boolean;
      clauseIndex?: number;
      segoc?: boolean;
      cardActivation?: boolean;
      leavesTo?: "gy";
      clauseText?: string;
      includes?: string[];
      /** If set, the previous chain card's effect/activation is negated. */
      negatesPrevious?: boolean;
      pendingResolve?: import("@/lib/rules/chain").PendingResolve;
    }
  | { type: "CHAIN_PASS"; player: PlayerId }
  | { type: "CHAIN_NEGATE_TOP" }
  | { type: "CHAIN_RESOLVE_ONE" }
  | { type: "CHAIN_FINISH" }
  | { type: "CHAIN_CLEAR" }
  | { type: "DEBUG_NOTE"; trace: Omit<ActivationTrace, "id" | "at"> & { at?: string } }
  | { type: "FET"; box: FetBox }
  | { type: "EVENT"; name: string }
  | { type: "GRANT_NORMAL_SUMMON"; player: PlayerId; count?: number }
  | { type: "FLAG_SPELL_ACTIVATED" }
  | {
      type: "MARK_EFFECT";
      player: PlayerId;
      cardId: number;
      cardName: string;
      clauseIndex: number;
      instanceId?: string;
      scope: "hard" | "soft";
    }
  | { type: "SETTLE_ACTIVATION"; instanceId: string }
  | {
      type: "NEGATE_CARDS";
      instanceIds: string[];
      untilTurn: number;
      halfAtk?: boolean;
      banish?: boolean;
    }
  | { type: "NEGATE_NAME"; nameKey: string; untilTurn: number }
  | {
      type: "ATTACK";
      player: PlayerId;
      attackerId: string;
      target?: ZoneRef;
      damage: number;
      /** Who loses LP. Defaults to the opponent. */
      damagePlayer?: PlayerId;
      destroyTarget?: boolean;
      destroyAttacker?: boolean;
    }
  | { type: "OVERLAY"; from: ZoneRef; onto: ZoneRef }
  | { type: "DETACH"; ref: ZoneRef }
  | {
      type: "PLAY";
      from: ZoneRef;
      player: PlayerId;
      mode: "summon-atk" | "summon-def" | "set-monster" | "set-st" | "activate-st" | "to-field";
      slot?: number;
      /** Effect / Extra / GY Special Summon — does not spend the Normal Summon. */
      special?: boolean;
      tributes?: ZoneRef[];
      /** Extra Deck materials sent to GY (Link/Synchro/Fusion proxy). */
      materials?: ZoneRef[];
      /** Xyz overlay / Fusion GY / alt banish. */
      materialsMode?: "gy" | "overlay" | "banish";
      leaveOnResolve?: "gy";
      /** Card-effect Extra Deck SS (Hallowed Azamina, etc.) — not a built-in ED summon. */
      effectSummon?: boolean;
    };

export type StartDuelInput = {
  formatId: FormatId;
  p1: { name: string; deck: DeckList };
  p2: { name: string; deck: DeckList };
  startingHand?: number;
  startingLp?: number;
  startingPlayer?: PlayerId;
  pve?: {
    bot: PlayerId;
    premadeId: string;
    deckName: string;
  };
  pvp?: {
    roomCode: string;
  };
};
