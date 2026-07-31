import { parseEffectOps } from "../src/lib/rules/effectOps";
import { parseActivationCosts } from "../src/lib/rules/activationCost";

const cases: Array<{ name: string; ok: boolean }> = [];
function check(name: string, cond: boolean) {
  cases.push({ name, ok: cond });
}

const eternal = parseEffectOps(
  `You can activate 1 of these effects;\n● Special Summon 1 "Dark Magician" from your hand or GY.\n● Add 1 "Dark Magic Attack" or "Thousand Knives" from your Deck to your hand.`,
);
check("eternal is choice", eternal[0]?.kind === "choice" && eternal[0].kind === "choice" && eternal[0].options.length === 2);
check(
  "eternal bullet 1 ss",
  eternal[0]?.kind === "choice" && eternal[0].options[0]!.ops.some((o) => o.kind === "search" && o.spec.dest === "summon"),
);
check(
  "eternal bullet 2 add",
  eternal[0]?.kind === "choice" && eternal[0].options[1]!.ops.some((o) => o.kind === "search" && o.spec.dest === "hand"),
);

const secrets = parseEffectOps(
  `Activate 1 of the following effects;\n● Fusion Summon 1 Fusion Monster from your Extra Deck, using monsters from your hand or field, including "Dark Magician" or "Dark Magician Girl".\n● Ritual Summon 1 Ritual Monster from your hand, by Tributing monsters from your hand or field, including "Dark Magician" or "Dark Magician Girl".`,
);
check("secrets choice 2", secrets[0]?.kind === "choice" && secrets[0].options.length === 2);
check(
  "secrets fusion op",
  secrets[0]?.kind === "choice" && secrets[0].options[0]!.ops.some((o) => o.kind === "fusion-spell"),
);
check(
  "secrets ritual op",
  secrets[0]?.kind === "choice" && secrets[0].options[1]!.ops.some((o) => o.kind === "ritual-spell"),
);

const circle = parseEffectOps(
  'When this card is activated: Look at the top 3 cards of your Deck, then you can reveal 1 of them that is "Dark Magician" or a Spell/Trap that mentions "Dark Magician", and add it to your hand, also place the remaining cards on top of your Deck in any order.',
);
check("circle excavate", circle[0]?.kind === "excavate" && circle[0].kind === "excavate" && circle[0].count === 3);

const lode = parseEffectOps(
  'You can declare 1 Normal Monster Card name; Special Summon 1 declared Normal Monster from your hand, Deck, or GY in Defense Position.',
);
check("lode declare", lode[0]?.kind === "declare-name" && lode[0].then === "ss-declared-normal");

const cross = parseEffectOps(
  "Declare 1 card name; banish 1 of that declared card from your Main Deck, and if you do, negate its effects, as well as the activated effects and effects on the field of cards with the same original name, until the end of this turn.",
);
check("crossout declare banish", cross[0]?.kind === "declare-name" && cross[0].then === "banish-declared-from-deck");

const droplet = parseEffectOps(
  "Send any number of other cards from your hand and/or field to the GY; choose that many Effect Monsters your opponent controls, and until the end of this turn, their ATK is halved, also their effects are negated.",
);
check("droplet negate many", droplet.some((o) => o.kind === "negate-faceup" && o.count === "sent-count" && o.halfAtk));
const dropCost = parseActivationCosts(
  "Send any number of other cards from your hand and/or field to the GY; choose that many",
);
check("droplet any-number cost", Boolean(dropCost[0]?.maxCount && dropCost[0].minCount === 1));

const souls = parseEffectOps("You can send up to 2 Spells/Traps from your hand and/or field to the GY; draw that many cards.");
check("souls draw that many", souls.some((o) => o.kind === "draw" && o.amount === "sent-count"));
const soulsCost = parseActivationCosts("You can send up to 2 Spells/Traps from your hand and/or field to the GY; draw that many cards.");
check("souls up-to-2 ST cost", soulsCost[0]?.maxCount === 2 && soulsCost[0]?.typeHint === "spell-trap");

const servant = parseEffectOps(
  'During your Main Phase: You can banish this card from the GY; draw cards equal to the number of "Palladium" monsters, "Dark Magician", and/or "Dark Magician Girl", with different names, on the field and in the GYs.',
);
check("servant variable draw", servant.some((o) => o.kind === "draw" && o.amount === "board-diff-names"));

const gaze = parseEffectOps(
  'Target 1 "Dark Magician" or "Dark Magician Girl" in your field or GY; Fusion Summon 1 Fusion Monster from your Extra Deck that mentions that monster as material, by shuffling it into the Deck as material.',
);
check("gaze fusion op", gaze.some((o) => o.kind === "gaze-fusion"));

const branded = parseEffectOps(
  'Fusion Summon 1 Fusion Monster that mentions "Fallen of Albaz" as material from your Extra Deck, using 2 monsters from your hand, Deck, or field as material.',
);
check("branded fusion-spell", branded.some((o) => o.kind === "fusion-spell" && o.from.includes("deck")));

const drill = parseEffectOps(
  "then target 1 face-up card on the field; negate its effects, and if you do, banish it.",
);
check("drillbeam negate+banish", drill.some((o) => o.kind === "negate-faceup" && o.banishAfter));

let fail = 0;
for (const c of cases) {
  if (!c.ok) {
    fail += 1;
    console.error("FAIL", c.name);
  }
}
if (fail) {
  console.error(fail, "effect-ops failures");
  process.exit(1);
}
console.log(`ok — ${cases.length} effect-ops checks`);
