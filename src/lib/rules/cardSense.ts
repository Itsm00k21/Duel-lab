import type { CompactCard } from "@/lib/cards/types";
import { isMonster, isQuickPlaySpell, isSpell, isTrap, type ParsedClause } from "./psct";
import { isCardActivationTrigger, isOptReminderClause } from "./effectOpt";
import { staysOnFieldAfterActivate } from "./stLifecycle";

/**
 * PSCT "common sense" — cross-check parseCard kinds against printed structure.
 * Konami PSCT: colon = activation condition, semicolon = cost/target at activation.
 * "If/When this card is Summoned/sent/…" is an event trigger.
 * "If this card is in your hand/GY" / "If you control…" is a state condition (usually ignition).
 * "During your Main Phase:" / "Once per turn:" / "You can [cost];" without an event is ignition.
 *
 * This is not a full EDOPro script DB. It only unblocks lines the text clearly allows
 * in an open Main Phase, and stops event-gating state conditions.
 */

export type SenseLoc = "field" | "hand" | "st" | "gy" | "banish";

export type SenseRole =
  | "ignition"
  | "trigger-event"
  | "quick"
  | "card-activation"
  | "summoning"
  | "continuous"
  | "opt-lock"
  | "skip";

export type CardSense = {
  role: SenseRole;
  /** Where this line is meant to be activated. */
  locs: SenseLoc[];
  /** Must wait for a matching game event (yellow/SEGOC). */
  eventGated: boolean;
  /** Offer during your open Main Phase (SS1 ignition / lingering ST). */
  mainPhaseClick: boolean;
  reason: string;
};

function condOf(clause: ParsedClause) {
  return (clause.condition ?? "").trim().toLowerCase();
}

function costOf(clause: ParsedClause) {
  return (clause.cost ?? "").trim().toLowerCase();
}

/** Condition + cost only — never resolution (avoids "to your hand" false locations). */
function head(clause: ParsedClause) {
  return `${condOf(clause)} ${costOf(clause)}`.trim();
}

const EVENT_RE =
  /\b(is|are|was|were)\s+((?:normal(?:\s+or\s+special)?|special|fusion|synchro|xyz|link|ritual|pendulum)\s+)?(summoned|sent|destroyed|banished|flipped|drawn|discarded|added|activated)\b|\bleaves? the field\b|\bis normal summoned\b|\bis special summoned\b|\bis sent to\b|\bis destroyed\b|\bis banished\b|\bis added\b|\ba card or effect is activated\b/;

const STATE_LOC_RE =
  /\bif this card is in (your )?(hand|gy|graveyard)\b|\bwhile this card is in (your )?(hand|gy|graveyard|banished)\b|\bif this card is banished\b/;

const STATE_BOARD_RE =
  /\bif you control\b|\bwhile you control\b|\bif you have\b|\bif there is\b|\bif your opponent controls\b|\bif you have no\b|\bif you control no\b/;

export function isEventCondition(cond: string) {
  const c = cond.toLowerCase().replace(/except during the [^,.;:]+/gi, "").trim();
  if (!/^(if|when|after)\b/.test(c) && !/^during .{0,40}\bif\b/.test(c)) {
    if (/^when this card is activated\b/.test(c)) return false;
    return EVENT_RE.test(c) && /^(if|when)\b/.test(c);
  }
  if (STATE_LOC_RE.test(c) && !EVENT_RE.test(c)) return false;
  if (STATE_BOARD_RE.test(c) && !EVENT_RE.test(c) && !/\b(summoned|sent|destroyed|banished)\b/.test(c)) return false;
  if (/^when this card is activated\b/.test(c)) return false;
  return EVENT_RE.test(c) || /^(if|when) (this card|a [a-z]|your opponent|you |a card|a monster|a spell|a trap)/.test(c) && EVENT_RE.test(c);
}

export function senseClause(card: CompactCard, clause: ParsedClause): CardSense {
  const cond = condOf(clause);
  const cost = costOf(clause);
  const h = head(clause);
  const raw = clause.raw.toLowerCase();

  if (isOptReminderClause(clause) || /^you can only (use|activate)\b/.test(raw.trim())) {
    return { role: "opt-lock", locs: [], eventGated: false, mainPhaseClick: false, reason: "Once-per-turn reminder — not an activation." };
  }
  if (clause.kind === "summoning" || (/special summon this card \(from your hand\)/.test(raw) && !cond && !clause.raw.includes(":") && !clause.raw.includes(";"))) {
    return { role: "summoning", locs: ["hand"], eventGated: false, mainPhaseClick: false, reason: "Summoning procedure, not an activated effect." };
  }
  if (clause.kind === "continuous" && !cond && !cost && clause.spellSpeed === 0) {
    return { role: "continuous", locs: ["field", "st"], eventGated: false, mainPhaseClick: false, reason: "Continuous text does not activate." };
  }
  if (isCardActivationTrigger(clause) || /^when this card is activated\b/.test(cond)) {
    return { role: "card-activation", locs: isSpell(card) || isTrap(card) ? ["hand", "st"] : ["field"], eventGated: false, mainPhaseClick: true, reason: "Spell/Trap card activation line." };
  }

  const quick =
    clause.kind === "quick" ||
    raw.includes("(quick effect)") ||
    cond.includes("during either player's") ||
    cond.includes("quick effect");

  const locs = inferLocs(card, clause, h, raw);

  if (quick) {
    const chainWatch =
      /when a card or effect is activated/.test(cond) ||
      /when your opponent activates/.test(cond) ||
      /if a card or effect is activated/.test(cond) ||
      /if your opponent activates/.test(cond);
    return {
      role: "quick",
      locs,
      eventGated: !chainWatch && isEventCondition(cond) && !STATE_LOC_RE.test(cond),
      mainPhaseClick: chainWatch
        ? false
        : !isEventCondition(cond) || STATE_LOC_RE.test(cond) || STATE_BOARD_RE.test(cond),
      reason: chainWatch
        ? "Quick Effect that responds to activations on the chain."
        : "Quick Effect — fast window; also usable in open game if not event-locked.",
    };
  }

  if (isEventCondition(cond) && !STATE_LOC_RE.test(cond)) {
    return {
      role: "trigger-event",
      locs,
      eventGated: true,
      mainPhaseClick: false,
      reason: "If/When event trigger — only in that window.",
    };
  }

  const stateCond = STATE_LOC_RE.test(cond) || STATE_BOARD_RE.test(h);
  const duringMain = /^during (your |the )?main phase\b/.test(cond) || /during your main phase/.test(cond);
  const duringOtherPhase = /during (your |the )?(standby|end|draw) phase/.test(cond) && !/main phase/.test(cond);
  const oncePer = /^once per turn\b/.test(cond);
  const youCanCost = /^you can\b/.test(cost) || /^you can\b/.test(cond) || /^you can\b/.test(raw.trim());
  const hasActivatePunct = Boolean((clause.condition && clause.raw.includes(":")) || clause.raw.includes(";"));

  if (duringOtherPhase) {
    return {
      role: "trigger-event",
      locs,
      eventGated: false,
      mainPhaseClick: false,
      reason: "Phase-locked effect (Standby/End/Draw) — not a Main Phase click.",
    };
  }

  if (stateCond && hasActivatePunct) {
    return {
      role: "ignition",
      locs,
      eventGated: false,
      mainPhaseClick: true,
      reason: "State condition (location/board), not an event — ignition/activation click in Main Phase.",
    };
  }

  if (duringMain || oncePer || (hasActivatePunct && youCanCost && !/^(if|when)\b/.test(cond))) {
    if (isTrap(card) && staysOnFieldAfterActivate(card)) {
      return {
        role: "quick",
        locs: locs.includes("st") || locs.includes("field") ? locs : ["st", "field"],
        eventGated: false,
        mainPhaseClick: true,
        reason: "Face-up Trap lingering effect is Spell Speed 2.",
      };
    }
    return {
      role: "ignition",
      locs,
      eventGated: false,
      mainPhaseClick: true,
      reason: duringMain
        ? "Printed Main Phase ignition."
        : oncePer
          ? "Once per turn ignition-style line."
          : "You can … ; … with no event — Main Phase activation.",
    };
  }

  if (clause.kind === "ignition") {
    return { role: "ignition", locs, eventGated: false, mainPhaseClick: true, reason: "Parsed as ignition." };
  }

  if ((clause.kind === "activation" || clause.kind === "unclassified") && (isSpell(card) || isTrap(card)) && hasActivatePunct) {
    const linger = staysOnFieldAfterActivate(card);
    if (isTrap(card) && linger) {
      return {
        role: "quick",
        locs: ["st", "field"],
        eventGated: false,
        mainPhaseClick: true,
        reason: "Face-up Continuous Trap effect is Spell Speed 2.",
      };
    }
    return {
      role: linger ? "ignition" : "card-activation",
      locs: linger ? ["st", "field"] : ["hand", "st"],
      eventGated: false,
      mainPhaseClick: true,
      reason: linger ? "Lingering Spell effect clickable after the card is face-up." : "Spell/Trap activation text.",
    };
  }

  if (clause.kind === "trigger") {
    // Parser said trigger, text does not look like an event — trust PSCT sense.
    if (!isEventCondition(cond)) {
      return {
        role: "ignition",
        locs,
        eventGated: false,
        mainPhaseClick: true,
        reason: "Labeled trigger but text is not an event — treat as Main Phase click.",
      };
    }
    return { role: "trigger-event", locs, eventGated: true, mainPhaseClick: false, reason: "Event trigger." };
  }

  return {
    role: clause.kind === "unclassified" ? "skip" : "skip",
    locs,
    eventGated: false,
    mainPhaseClick: false,
    reason: "No activatable pattern on this line.",
  };
}

function inferLocs(card: CompactCard, clause: ParsedClause, h: string, raw: string): SenseLoc[] {
  const locs = new Set<SenseLoc>();
  const res = (clause.resolution ?? "").toLowerCase();
  if (
    clause.fromGY ||
    /in (your )?(gy|graveyard)|from (your )?(gy|graveyard)|banish this card from (your )?(gy|graveyard)/.test(h) ||
    /add this card from (your |the )?(gy|graveyard)|this card from (your |the )?(gy|graveyard) to/.test(res) ||
    /if this card is in (your |the )?(gy|graveyard)/.test(raw)
  ) {
    locs.add("gy");
  }
  if (clause.fromBanished || /while this card is banished|this banished card|if this card is banished/.test(h + " " + res)) {
    locs.add("banish");
  }
  if (
    clause.fromHand ||
    /if this card is in your hand|while this card is in your hand|activate this card from your hand|discard this card|send this card from your hand/.test(h) ||
    /special summon this card from your hand|summon this card from your hand/.test(res + " " + h)
  ) {
    locs.add("hand");
  }
  if (isSpell(card) || isTrap(card)) {
    if (!locs.has("gy") && !locs.has("banish")) {
      locs.add("st");
      if (isQuickPlaySpell(card) || /activate this card from your hand/.test(raw)) locs.add("hand");
    }
  } else if (isMonster(card)) {
    if (!locs.has("gy") && !locs.has("banish") && !locs.has("hand")) locs.add("field");
    if (locs.has("hand") && /special summon this card/.test(raw)) locs.add("hand");
  }
  if (!locs.size) locs.add(isSpell(card) || isTrap(card) ? "st" : "field");
  return [...locs];
}

export function locMatchesSense(sense: CardSense, loc: SenseLoc | "extra" | "deck"): boolean {
  if (loc === "extra" || loc === "deck") return false;
  if (loc === "field" && sense.locs.includes("st") && !sense.locs.includes("field")) {
    /* Field Zone uses loc "field" in some menus and "st" in others */
  }
  if (sense.locs.includes(loc)) return true;
  if (loc === "field" && sense.locs.includes("st")) return true;
  if (loc === "st" && sense.locs.includes("field")) return true;
  return false;
}
