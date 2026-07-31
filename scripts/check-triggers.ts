import { parseCard } from "../src/lib/rules/psct";
import { conditionMatchesEvent, type DuelEvent } from "../src/lib/rules/triggerMatch";

function hit(desc: string, event: DuelEvent, isEventCard = false, type = "Effect Monster") {
  const clauses = parseCard({
    id: 1,
    name: "Test",
    type,
    frameType: "effect",
    desc,
  });
  return clauses.some((clause) => conditionMatchesEvent(clause, event, { owner: "p1", isEventCard }));
}

const cases: Array<{ name: string; got: boolean; expect: boolean }> = [
  {
    name: "Dark Magician",
    got: hit("''The ultimate wizard in terms of attack and defense.''", { type: "summon", summonKind: "normal" }, true),
    expect: false,
  },
  {
    name: "On-summon searcher self",
    got: hit(
      "If this card is Normal or Special Summoned: You can add 1 Spell from your Deck to your hand.",
      { type: "summon", summonKind: "normal" },
      true,
    ),
    expect: true,
  },
  {
    name: "On-summon searcher other copy",
    got: hit(
      "If this card is Normal or Special Summoned: You can add 1 Spell from your Deck to your hand.",
      { type: "summon", summonKind: "normal" },
      false,
    ),
    expect: false,
  },
  {
    name: "Ignition on summon event",
    got: hit(
      "During your Main Phase: You can Special Summon 1 Level 4 monster from your hand.",
      { type: "summon", summonKind: "normal" },
      true,
    ),
    expect: false,
  },
  {
    name: "Ignition on Main Phase",
    got: hit(
      "During your Main Phase: You can Special Summon 1 Level 4 monster from your hand.",
      { type: "phase", phase: "M1" },
    ),
    expect: false,
  },
  {
    name: "Standby trigger",
    got: hit("During your Standby Phase: Gain 1000 LP.", { type: "phase", phase: "SP" }),
    expect: true,
  },
  {
    name: "Ash on summon",
    got: hit(
      "When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate the activation.\n● Add a card from the Deck to the hand.\n● Special Summon from the GY.",
      { type: "summon", summonKind: "special" },
    ),
    expect: false,
  },
  {
    name: "Ash on activation",
    got: hit(
      "When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate the activation.",
      { type: "activation" },
    ),
    expect: true,
  },
  {
    name: "Sangan self GY",
    got: hit(
      "If this card is sent from the field to the GY: Add 1 monster with 1500 or less ATK from your Deck to your hand.",
      { type: "sent-gy" },
      true,
    ),
    expect: true,
  },
  {
    name: "Sangan other GY",
    got: hit(
      "If this card is sent from the field to the GY: Add 1 monster with 1500 or less ATK from your Deck to your hand.",
      { type: "sent-gy" },
      false,
    ),
    expect: false,
  },
  {
    name: "Torrential",
    got: hit("When a monster(s) is Summoned: Destroy all monsters on the field.", { type: "summon", summonKind: "normal" }, false, "Trap Card"),
    expect: true,
  },
];

let failed = 0;
for (const c of cases) {
  if (c.got !== c.expect) {
    failed += 1;
    console.log("FAIL", c.name, "expected", c.expect, "got", c.got);
  } else console.log("ok  ", c.name);
}
if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
