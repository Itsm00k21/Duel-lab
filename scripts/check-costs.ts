import { parseActivationCosts } from "../src/lib/rules/activationCost";

const cases: Array<[string, string, string]> = [
  ['You can discard this card', "discard", "self"],
  ['Discard 1 card', "discard", "hand"],
  ['by discarding 1 card', "discard", "hand"],
  ['Tribute 1 monster', "tribute", "field"],
  ['Tribute 1 monster from your hand or field', "tribute", "hand-or-field"],
  ['Pay 1500 LP', "pay-lp", "self"],
  ['Banish this card from your GY', "banish", "self"],
  ['Send this card from your hand to the GY', "discard", "self"],
  ['by sending 1 card from your hand or field to the GY', "send", "hand-or-field"],
];

let fail = 0;
for (const [text, kind, source] of cases) {
  const costs = parseActivationCosts(text);
  const hit = costs.find((c) => c.kind === kind && c.source === source);
  if (!hit && !(kind === "discard" && source === "self" && costs.some((c) => c.self))) {
    console.error("FAIL", text, costs);
    fail += 1;
  }
}
if (fail) process.exit(1);
console.log(`ok — ${cases.length} cost parses`);
