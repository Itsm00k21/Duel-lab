/**
 * Write docs/reference/card-coverage.json + card-coverage.md
 * from PREMADE_DECKS × YGOPRODeck compact cache. Reference only.
 *
 *   npx tsx scripts/dump-card-reference.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PREMADE_DECKS } from "../src/data/premade-decks";
import { decodeCardText } from "../src/lib/cards/compact";
import { applyCardLegalityFixes } from "../src/lib/cards/legality";
import type { CompactCard } from "../src/lib/cards/types";
import { parseCard, isMonster, isSpell, isTrap } from "../src/lib/rules/psct";
import { parseAllSearchSpecs } from "../src/lib/rules/searchEffect";
import { parseActivationCosts } from "../src/lib/rules/activationCost";
import { parseHandSpecialSummon } from "../src/lib/rules/handSpecialSummon";
import { parseAllExtraSummonSpecs } from "../src/lib/rules/extraSummon";
import { senseClause, isEventCondition } from "../src/lib/rules/cardSense";
import { isOptReminderClause, isCardActivationTrigger } from "../src/lib/rules/effectOpt";
import { parseResponseGate } from "../src/lib/rules/responseGate";
import { parseEffectOps } from "../src/lib/rules/effectOps";

const ROOT = path.join(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "docs", "reference");

const cards = (JSON.parse(readFileSync(path.join(ROOT, "data/cache/cards.compact.json"), "utf8")) as CompactCard[]).map((c) =>
  applyCardLegalityFixes({ ...c, name: decodeCardText(c.name), desc: decodeCardText(c.desc ?? "") }),
);
const byName = new Map(cards.map((c) => [c.name.toLowerCase(), c]));

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

type Status = "ok" | "partial" | "gap" | "skip" | "missing";

function scoreCard(card: CompactCard) {
  const desc = card.desc || "";
  const ops = OP_RES.filter((o) => o.re.test(desc)).map((o) => o.id);
  if (!desc.trim() || (isMonster(card) && !card.hasEffect && /\bnormal monster\b/i.test(card.type) && !/\beffect\b/i.test(card.type))) {
    return { status: "skip" as Status, ops, why: "No activated effect text", parsedOps: [] as string[], searches: 0, costs: 0 };
  }

  const clauses = parseCard(card);
  const notes: string[] = [];
  let worst: Status = "skip";
  const rank: Record<Status, number> = { skip: 0, ok: 1, partial: 2, gap: 3, missing: 4 };
  const bump = (s: Status, why: string) => {
    notes.push(`${s}: ${why}`);
    if (rank[s] > rank[worst]) worst = s;
  };

  const handSS = parseHandSpecialSummon(card);
  const extra = parseAllExtraSummonSpecs(card);
  if (handSS) bump("ok", "Inherent hand SS");
  if (extra.length) bump("ok", `Extra summon ×${extra.length}`);

  let parsedOpKinds: string[] = [];
  let searchCount = 0;
  let costCount = 0;

  for (const cl of clauses) {
    if (isOptReminderClause(cl) || /^you can only (use|activate)\b/i.test(cl.raw.trim())) continue;
    const sense = senseClause(card, cl);
    if (sense.role === "continuous" || sense.role === "summoning" || sense.role === "opt-lock") continue;
    const searches = parseAllSearchSpecs(`${cl.resolution} ${cl.raw}`);
    const costs = parseActivationCosts(`${cl.cost ?? ""} ${cl.raw}`);
    const eops = parseEffectOps(`${cl.resolution} ${cl.raw}`);
    parsedOpKinds = [...parsedOpKinds, ...eops.map((o) => o.kind)];
    searchCount += searches.length;
    costCount += costs.length;
    const clOps = OP_RES.filter((o) => o.re.test(cl.raw)).map((o) => o.id);
    const handled = new Set<Op>();
    if (eops.some((o) => o.kind === "choice")) handled.add("choice-bullets");
    if (eops.some((o) => o.kind === "excavate")) handled.add("excavate-top");
    if (eops.some((o) => o.kind === "declare-name")) handled.add("declare-name");
    if (eops.some((o) => o.kind === "fusion-spell" || o.kind === "gaze-fusion")) handled.add("fusion-spell");
    if (eops.some((o) => o.kind === "ritual-spell")) handled.add("ritual-summon");
    if (eops.some((o) => o.kind === "draw")) handled.add("draw-variable");
    if (eops.some((o) => o.kind === "negate-faceup")) handled.add("negate-on-field");
    const hardOps = clOps.filter(
      (o) =>
        !handled.has(o) &&
        [
          "excavate-top",
          "declare-name",
          "choice-bullets",
          "fusion-spell",
          "ritual-summon",
          "token",
          "coin-dice",
          "change-control",
          "attach-equip",
          "draw-variable",
          "banish-multiple",
          "negate-on-field",
        ].includes(o),
    );
    const hasResolveOp = eops.length > 0 || searches.length > 0 || costs.length > 0;
    const gate = parseResponseGate(card);

    if (isCardActivationTrigger(cl) || (sense.role === "card-activation" && (isSpell(card) || isTrap(card)))) {
      bump(hardOps.length ? "partial" : hasResolveOp ? "ok" : "partial", hardOps.length ? `unhandled ${hardOps.join(",")}` : "card activation");
      continue;
    }
    if (gate && (sense.role === "quick" || cl.kind === "quick")) {
      bump("ok", "chain responder");
      continue;
    }
    if (sense.eventGated || isEventCondition(cl.condition ?? "")) {
      bump(hardOps.length ? "partial" : "ok", hardOps.length ? `trigger + ${hardOps.join(",")}` : "event trigger");
      continue;
    }
    if (sense.mainPhaseClick || sense.role === "ignition" || sense.role === "quick") {
      if (hasResolveOp || sense.role === "quick") bump(hardOps.length ? "partial" : "ok", hardOps.length ? hardOps.join(",") : "MP/quick");
      else if (/you can\b/i.test(cl.raw) && /[:;]/.test(cl.raw)) bump("partial", "MP line no parsed ops");
      else bump(hardOps.length ? "partial" : "ok", sense.reason);
      continue;
    }
    if (/[:;]/.test(cl.raw) && /you can\b/i.test(cl.raw)) {
      bump("gap", cl.raw.slice(0, 100));
    }
  }

  if (worst === "skip" && notes.length) worst = "ok";
  return {
    status: worst,
    ops,
    why: notes.filter((n) => n.startsWith("partial") || n.startsWith("gap")).slice(0, 4).join(" · ") || notes[0] || "",
    parsedOps: [...new Set(parsedOpKinds)],
    searches: searchCount,
    costs: costCount,
  };
}

const unique = new Map<
  string,
  {
    name: string;
    id: number;
    type: string;
    decks: string[];
    tcgBan?: string;
    mdBan?: string;
    status: Status;
    textOps: Op[];
    parsedOps: string[];
    searches: number;
    costs: number;
    why: string;
  }
>();

for (const deck of PREMADE_DECKS) {
  const names = new Map<string, string>();
  for (const e of [...deck.main, ...deck.extra, ...(deck.side ?? [])]) names.set(e.name.toLowerCase(), e.name);
  for (const name of names.values()) {
    const card = byName.get(name.toLowerCase());
    const key = name.toLowerCase();
    if (!card) {
      const prev = unique.get(key);
      unique.set(key, {
        name,
        id: 0,
        type: "?",
        decks: [...new Set([...(prev?.decks ?? []), deck.id])],
        status: "missing",
        textOps: [],
        parsedOps: [],
        searches: 0,
        costs: 0,
        why: "Not in card DB",
      });
      continue;
    }
    const scored = scoreCard(card);
    const prev = unique.get(key);
    const rank: Record<Status, number> = { skip: 0, ok: 1, partial: 2, gap: 3, missing: 4 };
    const next = {
      name: card.name,
      id: card.id,
      type: card.type,
      decks: [...new Set([...(prev?.decks ?? []), deck.id])],
      tcgBan: card.banTcg,
      mdBan: card.banMd,
      status: scored.status,
      textOps: scored.ops,
      parsedOps: scored.parsedOps,
      searches: scored.searches,
      costs: scored.costs,
      why: scored.why,
    };
    if (!prev || rank[next.status] > rank[prev.status]) unique.set(key, next);
    else unique.set(key, { ...prev, decks: next.decks });
  }
}

const list = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
const tally = { ok: 0, partial: 0, gap: 0, skip: 0, missing: 0, total: list.length };
for (const r of list) tally[r.status] += 1;

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(
  path.join(OUT_DIR, "card-coverage.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      scope: "Unique names across PREMADE_DECKS only — not the entire card database.",
      tally,
      cards: list,
    },
    null,
    2,
  ),
);

const lines = [
  "# Premade-pool coverage (reference)",
  "",
  `Generated ${new Date().toISOString()}. Unique names in \`PREMADE_DECKS\` only — not every printed card.`,
  "",
  `| status | count |`,
  `| --- | ---: |`,
  `| ok | ${tally.ok} |`,
  `| partial | ${tally.partial} |`,
  `| gap | ${tally.gap} |`,
  `| skip (normals / no text) | ${tally.skip} |`,
  `| missing from DB | ${tally.missing} |`,
  `| **unique** | **${tally.total}** |`,
  "",
  "## Gaps",
  "",
];
const gaps = list.filter((c) => c.status === "gap" || c.status === "missing");
if (!gaps.length) lines.push("_None in this pass._", "");
else {
  lines.push("| card | status | why |", "| --- | --- | --- |");
  for (const c of gaps) lines.push(`| ${c.name} | ${c.status} | ${c.why.replace(/\|/g, "/")} |`);
  lines.push("");
}

lines.push("## Partials (unhandled ops or mixed text)", "");
const parts = list.filter((c) => c.status === "partial");
lines.push("| card | text ops still noisy | note |", "| --- | --- | --- |");
for (const c of parts.slice(0, 200)) {
  lines.push(`| ${c.name} | ${c.textOps.join(", ") || "—"} | ${c.why.replace(/\|/g, "/").slice(0, 140)} |`);
}
if (parts.length > 200) lines.push(`| … | | ${parts.length - 200} more in card-coverage.json |`);
lines.push("");

writeFileSync(path.join(OUT_DIR, "card-coverage.md"), lines.join("\n"));
console.log(`wrote ${list.length} cards → docs/reference/card-coverage.{json,md}`);
console.log(tally);
