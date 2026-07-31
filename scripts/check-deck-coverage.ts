/**
 * Meta-deck coverage report.
 * Scores every card in PREMADE_DECKS against text patterns the Lab can run,
 * then prints per-deck coverage and the most common unsupported operations.
 *
 *   npx tsx scripts/check-deck-coverage.ts
 *   npx tsx scripts/check-deck-coverage.ts --deck tcg-dark-magician-azamina
 */
import { readFileSync } from "node:fs";
import { PREMADE_DECKS } from "../src/data/premade-decks";
import { decodeCardText } from "../src/lib/cards/compact";
import { applyCardLegalityFixes } from "../src/lib/cards/legality";
import type { CompactCard } from "../src/lib/cards/types";
import { parseCard, isMonster, isSpell, isTrap } from "../src/lib/rules/psct";
import { parseAllSearchSpecs } from "../src/lib/rules/searchEffect";
import { parseActivationCosts } from "../src/lib/rules/activationCost";
import { parseHandSpecialSummon } from "../src/lib/rules/handSpecialSummon";
import { parseAllExtraSummonSpecs } from "../src/lib/rules/extraSummon";
import { senseClause } from "../src/lib/rules/cardSense";
import { isOptReminderClause, isCardActivationTrigger } from "../src/lib/rules/effectOpt";
import { parseResponseGate } from "../src/lib/rules/responseGate";
import { isEventCondition } from "../src/lib/rules/cardSense";
import { parseEffectOps } from "../src/lib/rules/effectOps";

const cards = (JSON.parse(readFileSync("data/cache/cards.compact.json", "utf8")) as CompactCard[]).map((c) =>
  applyCardLegalityFixes({ ...c, name: decodeCardText(c.name), desc: decodeCardText(c.desc ?? "") }),
);
const byName = new Map(cards.map((c) => [c.name.toLowerCase(), c]));

const deckFilter = process.argv.includes("--deck") ? process.argv[process.argv.indexOf("--deck") + 1] : null;
const decks = deckFilter ? PREMADE_DECKS.filter((d) => d.id === deckFilter || d.name.toLowerCase() === deckFilter.toLowerCase()) : PREMADE_DECKS;

type Op =
  | "excavate-top"
  | "declare-name"
  | "choice-bullets"
  | "draw-variable"
  | "place-bottom"
  | "shuffle-into-deck"
  | "change-control"
  | "attach-equip"
  | "counters"
  | "coin-dice"
  | "destroy-multiple"
  | "banish-multiple"
  | "attack-all"
  | "unaffected"
  | "negate-on-field"
  | "look-reveal-hand"
  | "return-to-hand"
  | "ritual-summon"
  | "fusion-spell"
  | "xyz-rank-up"
  | "token"
  | "damage-step";

const OP_RES: Array<{ id: Op; re: RegExp }> = [
  { id: "excavate-top", re: /look at the top|excavate|top \d+ cards of your deck/i },
  { id: "declare-name", re: /declare 1 .{0,40}name|declare 1 card name/i },
  { id: "choice-bullets", re: /activate 1 of these effects|●/ },
  { id: "draw-variable", re: /draw cards equal to|draw that many/i },
  { id: "place-bottom", re: /bottom of (your |the )?deck/i },
  { id: "shuffle-into-deck", re: /shuffle.{0,40}into (your |the )?deck/i },
  { id: "change-control", re: /take control|your opponent gains control/i },
  { id: "attach-equip", re: /equip (it|that|this card)|as an equip/i },
  { id: "counters", re: /spell counter|place \d+ .{0,20}counter/i },
  { id: "coin-dice", re: /toss a coin|roll a (six-sided )?die/i },
  { id: "destroy-multiple", re: /destroy (all|as many|cards your opponent|all monsters|all spells)/i },
  { id: "banish-multiple", re: /banish (all|the top \d+|cards from the top)/i },
  { id: "attack-all", re: /attack (all|directly|twice)/i },
  { id: "unaffected", re: /unaffected by/i },
  { id: "negate-on-field", re: /negate (the effects|its effects|that face-up|face-up card)/i },
  { id: "look-reveal-hand", re: /reveal (your|their|both players).{0,12}hand|look at .{0,20}hand/i },
  { id: "return-to-hand", re: /return.{0,40}to (the |your |its owner'?s )?hand/i },
  { id: "ritual-summon", re: /ritual summon/i },
  { id: "fusion-spell", re: /fusion summon 1/i },
  { id: "xyz-rank-up", re: /xyz summon.{0,40}on top|using.{0,30}as material/i },
  { id: "token", re: /special summon.{0,40}token/i },
  { id: "damage-step", re: /damage step/i },
];

type ClauseScore = {
  status: "ok" | "partial" | "gap" | "skip";
  why: string;
  ops: Op[];
};

function scoreCard(card: CompactCard): { clauses: ClauseScore[]; ops: Op[]; status: "ok" | "partial" | "gap" | "skip" } {
  const desc = card.desc || "";
  const ops = OP_RES.filter((o) => o.re.test(desc)).map((o) => o.id);
  if (!desc.trim() || (isMonster(card) && !card.hasEffect && /\bnormal monster\b/i.test(card.type) && !/\beffect\b/i.test(card.type))) {
    return { clauses: [{ status: "skip", why: "No activated effect text", ops: [] }], ops, status: "skip" };
  }

  const clauses = parseCard(card);
  const scores: ClauseScore[] = [];
  const handSS = parseHandSpecialSummon(card);
  const extra = parseAllExtraSummonSpecs(card);
  const gate = parseResponseGate(card);

  if (handSS) scores.push({ status: "ok", why: "Inherent hand SS procedure", ops: [] });
  if (extra.length) scores.push({ status: "ok", why: `Extra summon procedure ×${extra.length}`, ops: [] });

  for (const cl of clauses) {
    if (isOptReminderClause(cl) || /^you can only (use|activate)\b/i.test(cl.raw.trim())) {
      scores.push({ status: "skip", why: "OPT reminder", ops: [] });
      continue;
    }
    const sense = senseClause(card, cl);
    if (sense.role === "continuous" || sense.role === "summoning" || sense.role === "opt-lock") {
      scores.push({ status: "skip", why: sense.reason, ops: [] });
      continue;
    }
    const searches = parseAllSearchSpecs(`${cl.resolution} ${cl.raw}`);
    const costs = parseActivationCosts(`${cl.cost ?? ""} ${cl.raw}`);
    const ops = parseEffectOps(`${cl.resolution} ${cl.raw}`);
    const clOps = OP_RES.filter((o) => o.re.test(cl.raw)).map((o) => o.id);
    const handled = new Set<Op>();
    if (ops.some((o) => o.kind === "choice")) handled.add("choice-bullets");
    if (ops.some((o) => o.kind === "excavate")) handled.add("excavate-top");
    if (ops.some((o) => o.kind === "declare-name")) handled.add("declare-name");
    if (ops.some((o) => o.kind === "fusion-spell" || o.kind === "gaze-fusion")) handled.add("fusion-spell");
    if (ops.some((o) => o.kind === "ritual-spell")) handled.add("ritual-summon");
    if (ops.some((o) => o.kind === "draw")) handled.add("draw-variable");
    if (ops.some((o) => o.kind === "negate-faceup")) handled.add("negate-on-field");
    const hardOps = clOps.filter(
      (o) =>
        !handled.has(o) &&
        ["excavate-top", "declare-name", "choice-bullets", "fusion-spell", "ritual-summon", "token", "coin-dice", "change-control", "attach-equip", "draw-variable", "banish-multiple", "negate-on-field"].includes(o),
    );
    const hasResolveOp = ops.length > 0 || searches.length > 0 || costs.length > 0;

    if (isCardActivationTrigger(cl) || (sense.role === "card-activation" && (isSpell(card) || isTrap(card)))) {
      scores.push({
        status: hasResolveOp || !/add |set |special summon|send |look at|declare |fusion summon|ritual summon|negate /i.test(cl.raw)
          ? hardOps.length
            ? "partial"
            : "ok"
          : "partial",
        why: hasResolveOp ? `Card activation + resolve ops` : "Card activation (may have unparsed resolve text)",
        ops: clOps.filter((o) => !handled.has(o)),
      });
      continue;
    }
    if (gate && (sense.role === "quick" || cl.kind === "quick")) {
      scores.push({ status: "ok", why: "Chain responder (Ash-style gate)", ops: clOps });
      continue;
    }
    if (sense.eventGated || isEventCondition(cl.condition ?? "")) {
      scores.push({
        status: hardOps.length ? "partial" : "ok",
        why: `Event trigger (${(cl.condition ?? "").slice(0, 60)})`,
        ops: clOps,
      });
      continue;
    }
    if (sense.mainPhaseClick || sense.role === "ignition" || sense.role === "quick") {
      if (hasResolveOp || sense.role === "quick") {
        scores.push({
          status: hardOps.length ? "partial" : "ok",
          why: hasResolveOp ? "MP click + parsed resolve ops" : "MP/quick click",
          ops: clOps.filter((o) => !handled.has(o)),
        });
      } else if (/you can\b/i.test(cl.raw) && /[:;]/.test(cl.raw)) {
        scores.push({ status: "partial", why: "MP-looking line with no parsed cost/search/ops", ops: clOps });
      } else {
        scores.push({ status: hardOps.length ? "partial" : "ok", why: sense.reason, ops: clOps.filter((o) => !handled.has(o)) });
      }
      continue;
    }
    if (/[:;]/.test(cl.raw) && /you can\b/i.test(cl.raw)) {
      scores.push({ status: "gap", why: `Activatable text not classified: ${cl.raw.slice(0, 90)}`, ops: clOps });
      continue;
    }
    scores.push({ status: "skip", why: "Non-activating line", ops: clOps });
  }

  const live = scores.filter((s) => s.status !== "skip");
  const status: "ok" | "partial" | "gap" | "skip" = !live.length
    ? "skip"
    : live.some((s) => s.status === "gap")
      ? "gap"
      : live.some((s) => s.status === "partial")
        ? "partial"
        : "ok";
  return { clauses: scores, ops, status };
}

type Row = { deck: string; name: string; status: "ok" | "partial" | "gap" | "skip" | "missing"; ops: Op[]; why: string };

const rows: Row[] = [];
const missing: string[] = [];

for (const deck of decks) {
  const names = new Map<string, string>();
  for (const e of [...deck.main, ...deck.extra, ...(deck.side ?? [])]) names.set(e.name.toLowerCase(), e.name);
  for (const name of names.values()) {
    const card = byName.get(name.toLowerCase());
    if (!card) {
      missing.push(`${deck.id}: ${name}`);
      rows.push({ deck: deck.id, name, status: "missing", ops: [], why: "Not in card DB" });
      continue;
    }
    const scored = scoreCard(card);
    const why = scored.clauses
      .filter((c) => c.status === "gap" || c.status === "partial")
      .map((c) => c.why)
      .slice(0, 2)
      .join(" · ");
    rows.push({ deck: deck.id, name: card.name, status: scored.status, ops: scored.ops, why });
  }
}

const unique = new Map<string, Row>();
for (const r of rows) {
  const prev = unique.get(r.name.toLowerCase());
  if (!prev) unique.set(r.name.toLowerCase(), r);
  else {
    const rank = { missing: 4, gap: 3, partial: 2, ok: 1, skip: 0 };
    if (rank[r.status] > rank[prev.status]) unique.set(r.name.toLowerCase(), r);
  }
}

function tally(list: Row[]) {
  const t = { ok: 0, partial: 0, gap: 0, skip: 0, missing: 0, total: list.length };
  for (const r of list) t[r.status] += 1;
  return t;
}

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "—";
}

console.log("\n=== Meta deck effect coverage ===\n");
console.log("Deck".padEnd(28), "cards", "ok".padStart(5), "part".padStart(6), "gap".padStart(5), "skip".padStart(5), "miss".padStart(5), "runnable");
for (const deck of decks) {
  const list = rows.filter((r) => r.deck === deck.id);
  const t = tally(list);
  const runnable = t.ok + t.partial;
  console.log(
    deck.id.padEnd(28),
    String(t.total).padStart(5),
    String(t.ok).padStart(5),
    String(t.partial).padStart(6),
    String(t.gap).padStart(5),
    String(t.skip).padStart(5),
    String(t.missing).padStart(5),
    pct(runnable, t.total - t.skip - t.missing).padStart(8),
  );
}

const all = [...unique.values()];
const t = tally(all);
console.log("\nUnique cards across selected decks:", t.total);
console.log(`  ok      ${t.ok}  (${pct(t.ok, t.total)})  fully patterned`);
console.log(`  partial ${t.partial}  (${pct(t.partial, t.total)})  activates, some resolve ops missing`);
console.log(`  gap     ${t.gap}  (${pct(t.gap, t.total)})  activatable text we don't classify`);
console.log(`  skip    ${t.skip}  vanilla / continuous / reminders`);
console.log(`  missing ${t.missing}  name not in DB`);

const opCount = new Map<Op, number>();
for (const r of all) {
  if (r.status === "partial" || r.status === "gap") {
    for (const op of r.ops) opCount.set(op, (opCount.get(op) ?? 0) + 1);
  }
}
const topOps = [...opCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log("\nMost common unsupported/partial ops on gap+partial cards:");
for (const [op, n] of topOps) console.log(`  ${String(n).padStart(3)}  ${op}`);

const worst = all.filter((r) => r.status === "gap" || r.status === "partial").slice();
console.log("\nExample partial/gap cards:");
for (const r of worst.slice(0, 18)) {
  console.log(`  [${r.status}] ${r.name}${r.ops.length ? ` · ${r.ops.slice(0, 3).join(",")}` : ""}${r.why ? ` — ${r.why.slice(0, 100)}` : ""}`);
}

if (missing.length) {
  console.log("\nMissing from DB:");
  for (const m of missing.slice(0, 20)) console.log(" ", m);
}

if (!decks.length) {
  console.error("No decks matched");
  process.exit(1);
}
console.log("\nok — coverage report (informational)");
