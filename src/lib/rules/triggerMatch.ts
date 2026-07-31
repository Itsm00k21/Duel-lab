import type { ParsedClause } from "./psct";

export type DuelEventType =
  | "summon"
  | "sent-gy"
  | "banish"
  | "draw"
  | "phase"
  | "flip"
  | "destroy"
  | "activation"
  | "add-to-hand";

export type DuelEvent = {
  type: DuelEventType;
  player?: "p1" | "p2";
  cardId?: number;
  instanceId?: string;
  phase?: "DP" | "SP" | "M1" | "BP" | "M2" | "EP";
  summonKind?: "normal" | "special" | "set" | "flip";
  /** Controller of the card that caused the event. */
  controller?: "p1" | "p2";
  /** Who received the card (add-to-hand / draw). */
  toPlayer?: "p1" | "p2";
  fromZone?: "deck" | "gy" | "extra" | "banish" | "field" | "hand";
};

export type ConditionShape = {
  selfEvent: boolean;
  watchesOthers: boolean;
  yourSide?: boolean;
  opponentSide?: boolean;
  normalSummon?: boolean;
  specialSummon?: boolean;
  anySummon?: boolean;
  sentToGY?: boolean;
  destroyed?: boolean;
  banished?: boolean;
  drawn?: boolean;
  addedFromDeck?: boolean;
  flipped?: boolean;
  activation?: boolean;
  standbyPhase?: boolean;
  endPhase?: boolean;
  drawPhase?: boolean;
  battlePhase?: boolean;
  mainPhaseIgnition: boolean;
};

const SELF = /\bthis card\b/;

export function conditionText(clause: ParsedClause) {
  const cond = (clause.condition ?? "").trim();
  if (cond) return cond.toLowerCase();
  // No colon → not an activated trigger window we should auto-ask.
  return "";
}

export function isAutoPromptable(clause: ParsedClause) {
  if (clause.kind === "continuous" || clause.kind === "summoning" || clause.kind === "ignition") return false;
  if (clause.kind === "activation") return false;
  const cond = conditionText(clause);
  if (!cond) return false;
  if (clause.kind === "trigger" || clause.kind === "flip") return true;
  // Quick only if the condition is a real When/If event, not "During your Main Phase (Quick Effect)"
  if (clause.kind === "quick") {
    if (/^during your main phase\b/.test(cond) && !/\bif\b|\bwhen\b/.test(cond)) return false;
    return /^(if|when)\b/.test(cond) || /\b(if|when)\b.{0,12}(summon|sent|destroy|banish|activat|draw|flip)/.test(cond);
  }
  return /^(if|when)\b/.test(cond) || /^(during (your |the |each )?(standby|end) phase)\b/.test(cond);
}

export function parseCondition(condRaw: string): ConditionShape {
  const cond = condRaw.toLowerCase();
  const self = SELF.test(cond);
  const mainPhaseIgnition =
    /^during (your |the )?main phase\b/.test(cond) && !/\b(if|when)\b/.test(cond) && !/standby|end phase/.test(cond);

  const summonEvent = Boolean(
    /\b(is|are|was|were)\s+((?:normal(?:\s+or\s+special)?|special)\s+)?summoned\b/.test(cond) ||
      /\b(you|your opponent|opponent)\s+((?:normal(?:\s+or\s+special)?|special)\s+)?summon/.test(cond) ||
      (/\bwhen a monster/.test(cond) && /\bsummon/.test(cond)) ||
      /\ba monster\(s\)?\s+(is|are)\s+summoned\b/.test(cond),
  );
  const anySummon = summonEvent && !/cannot be ((?:normal |special |normal or special )?summon)/.test(cond);
  const normalSummon = /normal summon/.test(cond) || /normal or special summon/.test(cond);
  const specialSummon = /special summon/.test(cond) || /normal or special summon/.test(cond);
  const sentToGY =
    /(is|are|was|were)\s+sent to (?:the |your opponent'?s? |their |either )?(gy|graveyard)/.test(cond) ||
    /sent from (the field|your (hand|field|deck)|its owner'?s? (hand|field)) to (?:the |your opponent'?s? )?(gy|graveyard)/.test(
      cond,
    );
  const destroyed = /\b(is|are|was|were)\s+destroy/.test(cond) || /\bdestroy(?:s|ed)?\s+this card\b/.test(cond);
  const banished = /\b(is|are|was|were)\s+banish/.test(cond) || /\bbanish(?:es|ed)?\s+this card\b/.test(cond);
  const drawn = /\b(you draw|when you draw|if you draw|a card(?:\(s\))?\s+is drawn)\b/.test(cond);
  const addedFromDeck =
    /added from (?:the |your |either player'?s? )?main deck to (?:your opponent'?s? |your |either player'?s? )?hand/.test(cond) ||
    /add(?:s|ed|ing)? (?:a |1 |one )?card\(s\)? from (?:the |your )?main deck to/.test(cond);
  const flipped = /\b(is|are)\s+flipped\b|\bflip summon/.test(cond) || /^flip\b/.test(cond);
  const activation = /\b(is|are)\s+activated\b|\bactivates?\b|\bactivation\b/.test(cond);
  const standbyPhase = /standby phase/.test(cond);
  const endPhase = /end phase/.test(cond);
  const drawPhase = /draw phase/.test(cond);
  const battlePhase = /battle phase|\battack(s|ed|ing)?\b/.test(cond);

  const opponentSide = /your opponent|opponent.s/.test(cond);
  const yourSide = /\byou \b|\byour (?!opponent)/.test(cond) && !opponentSide;

  const watchesOthers =
    !self &&
    anySummon &&
    (/\ba (monster|card|spell|trap)/.test(cond) ||
      /\bmonster\(s\)/.test(cond) ||
      opponentSide ||
      yourSide);

  return {
    selfEvent: self,
    watchesOthers: watchesOthers || (!self && anySummon && !mainPhaseIgnition),
    yourSide,
    opponentSide,
    normalSummon,
    specialSummon,
    anySummon: anySummon && !/cannot be (normal |special )?summon/.test(cond),
    sentToGY,
    destroyed,
    banished,
    drawn,
    addedFromDeck,
    flipped,
    activation,
    standbyPhase,
    endPhase,
    drawPhase,
    battlePhase,
    mainPhaseIgnition,
  };
}

export function conditionMatchesEvent(
  clause: ParsedClause,
  event: DuelEvent,
  opts: { owner: "p1" | "p2"; isEventCard: boolean },
): boolean {
  if (!isAutoPromptable(clause)) return false;
  const cond = conditionText(clause);
  if (!cond) return false;
  const shape = parseCondition(cond);
  if (shape.mainPhaseIgnition) return false;

  const controllerIsOwner = !event.controller || event.controller === opts.owner;
  const controllerIsOpponent = !!event.controller && event.controller !== opts.owner;

  if (shape.opponentSide && !controllerIsOpponent && event.type !== "phase") {
    // Opponent-watchers only fire on the opponent's action.
    if (event.player && event.player === opts.owner && !shape.selfEvent) return false;
  }

  switch (event.type) {
    case "summon": {
      if (!shape.anySummon && !shape.normalSummon && !shape.specialSummon) return false;
      if (event.summonKind === "normal" && shape.specialSummon && !shape.normalSummon && !/normal or special/.test(cond) && !/\bis summoned\b/.test(cond) && !/a monster/.test(cond)) {
        // "If this card is Special Summoned" should not fire on Normal Summon
        if (shape.selfEvent && !shape.normalSummon && shape.specialSummon && !/normal or special summon/.test(cond)) return false;
      }
      if (event.summonKind === "special" && shape.normalSummon && !shape.specialSummon && !/normal or special/.test(cond)) {
        if (shape.selfEvent) return false;
      }
      if (event.summonKind === "set") return false;
      if (shape.selfEvent) return opts.isEventCard;
      if (shape.opponentSide && event.controller === opts.owner) return false;
      if (shape.yourSide && event.controller && event.controller !== opts.owner && !shape.opponentSide) {
        return false;
      }
      return Boolean(shape.watchesOthers || shape.anySummon);
    }
    case "sent-gy": {
      if (!shape.sentToGY && !(shape.destroyed && /gy|graveyard/.test(cond))) return false;
      if (shape.selfEvent) return opts.isEventCard;
      return Boolean(shape.watchesOthers || shape.sentToGY);
    }
    case "destroy": {
      if (!shape.destroyed) return false;
      if (shape.selfEvent) return opts.isEventCard;
      return true;
    }
    case "banish": {
      if (!shape.banished) return false;
      if (shape.selfEvent) return opts.isEventCard;
      return true;
    }
    case "add-to-hand": {
      if (!shape.addedFromDeck && !/added from|add(?:s|ed).{0,40}from .{0,20}deck to .{0,20}hand/.test(cond)) return false;
      if (event.fromZone && event.fromZone !== "deck") return false;
      if (event.phase === "DP") return false;
      const receiver = event.toPlayer ?? event.player;
      if (shape.opponentSide || /your opponent'?s? hand/.test(cond)) {
        return Boolean(receiver && receiver !== opts.owner);
      }
      if (/to your hand/.test(cond) && !/opponent/.test(cond)) {
        return Boolean(receiver && receiver === opts.owner);
      }
      return Boolean(receiver && receiver !== opts.owner);
    }
    case "draw": {
      if (!shape.drawn) return false;
      // "draw 1 card" as cost/resolution is in condition rarely; require draw as the event
      if (!/\b(you )?draw|\ba card is drawn|draw phase/.test(cond)) return false;
      if (shape.selfEvent) return opts.isEventCard;
      return /if you draw|when you draw|whenever you draw|a card\(s\)? is drawn/.test(cond);
    }
    case "flip": {
      if (!shape.flipped && clause.kind !== "flip") return false;
      if (shape.selfEvent || clause.kind === "flip") return opts.isEventCard;
      return shape.watchesOthers;
    }
    case "activation": {
      if (!shape.activation) return false;
      // Requires targeting info we do not track yet.
      if (/target(?:s|ed|ing)? this card/.test(cond)) return false;
      // Resolved with the card activation itself — do not prompt again.
      if (/when this card is activated/.test(cond)) return false;
      if (shape.selfEvent) return opts.isEventCard;
      return /activat/.test(cond);
    }
    case "phase": {
      if (!event.phase) return false;
      if (event.phase === "SP") return Boolean(shape.standbyPhase);
      if (event.phase === "EP") return Boolean(shape.endPhase);
      if (event.phase === "DP") return Boolean(shape.drawPhase && !shape.drawn);
      if (event.phase === "BP") return Boolean(shape.battlePhase && /battle phase/.test(cond));
      // Main phases: do not auto-prompt ignition
      return false;
    }
    default:
      return false;
  }
}

export function eventLabel(event: DuelEvent) {
  switch (event.type) {
    case "summon":
      return event.summonKind === "special"
        ? "a monster was Special Summoned"
        : event.summonKind === "normal"
          ? "a monster was Normal Summoned"
          : "a monster was Summoned";
    case "sent-gy":
      return "a card was sent to the GY";
    case "destroy":
      return "a card was destroyed";
    case "banish":
      return "a card was banished";
    case "draw":
      return "a card was drawn";
    case "flip":
      return "a monster was flipped";
    case "activation":
      return "a card/effect was activated";
    case "phase":
      return `the ${event.phase} started`;
    default:
      return "a game event";
  }
}
