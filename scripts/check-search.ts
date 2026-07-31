import { parseSearchSpec, parseAllSearchSpecs, cardMatchesSearch } from "../src/lib/rules/searchEffect";
import type { CompactCard } from "../src/lib/cards/types";

function c(name: string, type: string, extra?: Partial<CompactCard>): CompactCard {
  return { id: Math.random(), name, type, frameType: "effect", desc: "", ...extra };
}

const cases: Array<{ name: string; ok: boolean }> = [];
function check(name: string, cond: boolean) {
  cases.push({ name, ok: cond });
}

const sal = parseSearchSpec('When this card is activated: You can Set 1 "Eternal Soul" directly from your Deck.');
check("salvation spec", Boolean(sal && sal.dest === "set-st" && sal.source === "deck" && sal.quotedNames.includes("Eternal Soul")));
check("salvation match soul", Boolean(sal && cardMatchesSearch(c("Eternal Soul", "Trap Card"), sal)));
check("salvation no DM", Boolean(sal && !cardMatchesSearch(c("Dark Magician", "Normal Monster"), sal)));

const aluber = parseSearchSpec('If this card is Normal or Special Summoned: You can add 1 "Branded" Spell/Trap from your Deck to your hand.');
check("aluber spec", Boolean(aluber && aluber.dest === "hand" && aluber.archetypes.includes("Branded") && aluber.typeHint === "spell-trap"));
check("aluber branded fusion", Boolean(aluber && cardMatchesSearch(c("Branded Fusion", "Spell Card", { archetype: "Branded" }), aluber)));
check("aluber albaz no", Boolean(aluber && !cardMatchesSearch(c("Fallen of Albaz", "Effect Monster", { archetype: "Despia" }), aluber)));

const rota = parseSearchSpec("Add 1 Level 4 or lower Warrior monster from your Deck to your hand.");
check("rota warrior lv4", Boolean(rota && rota.dest === "hand" && rota.races.includes("Warrior") && rota.levelMax === 4));
check(
  "rota goblin",
  Boolean(rota && cardMatchesSearch(c("Goblin Attack Force", "Effect Monster", { race: "Warrior", level: 4, attribute: "EARTH" }), rota)),
);
check(
  "rota lv5 no",
  Boolean(rota && !cardMatchesSearch(c("Warrior Dai Grepher", "Normal Monster", { race: "Warrior", level: 5, attribute: "EARTH" }), rota)),
);

const celtic = parseSearchSpec(
  'If this card is Normal or Special Summoned: You can reveal your entire hand, and if you revealed a card that mentions "Light and Darkness Ritual", you can draw 3 cards, then discard 2 cards, also for the rest of this turn, you can only Special Summon once from the Extra Deck.',
);
check("celtic mystic not a fake extra search", celtic == null);

const stratos = parseSearchSpec('Add 1 "HERO" monster from your Deck to your hand.');
check("stratos archetype", Boolean(stratos && stratos.archetypes.includes("HERO") && stratos.typeHint === "monster"));
check(
  "stratos stratos card",
  Boolean(stratos && cardMatchesSearch(c("Elemental HERO Stratos", "Effect Monster", { archetype: "HERO" }), stratos)),
);

const navText =
  'Special Summon 1 "Dark Magician" from your hand, then Special Summon 1 Level 7 or lower DARK Spellcaster monster from your Deck.';
const nav = parseAllSearchSpecs(navText);
check("nav two steps", nav.length === 2);
check("nav first DM hand", Boolean(nav[0] && nav[0].dest === "summon" && nav[0].source === "hand" && nav[0].quotedNames.includes("Dark Magician")));
check(
  "nav second deck filter",
  Boolean(nav[1] && nav[1].dest === "summon" && nav[1].source === "deck" && nav[1].levelMax === 7 && nav[1].attributes.includes("DARK") && nav[1].races.includes("Spellcaster")),
);
check("nav match DM", Boolean(nav[0] && cardMatchesSearch(c("Dark Magician", "Normal Monster", { race: "Spellcaster", level: 7, attribute: "DARK" }), nav[0])));
check(
  "nav match magician of dark illusion",
  Boolean(nav[1] && cardMatchesSearch(c("Magician of Dark Illusion", "Effect Monster", { race: "Spellcaster", level: 7, attribute: "DARK" }), nav[1])),
);
check(
  "nav no blue-eyes",
  Boolean(nav[1] && !cardMatchesSearch(c("Blue-Eyes White Dragon", "Normal Monster", { race: "Dragon", level: 8, attribute: "LIGHT" }), nav[1])),
);

const lodeText =
  'When this card is activated: Add 1 "Primite" card from your Deck to your hand, except "Primite Lordly Lode". You can declare 1 Normal Monster Card name; Special Summon 1 declared Normal Monster from your hand, Deck, or GY in Defense Position, also you cannot activate the effects of Special Summoned monsters on the field this turn.';
const lodeAdd = parseSearchSpec('Add 1 "Primite" card from your Deck to your hand, except "Primite Lordly Lode".');
check("lode add archetype", Boolean(lodeAdd && lodeAdd.archetypes.includes("Primite") && lodeAdd.exceptNames.includes("Primite Lordly Lode")));
check(
  "lode add match drillbeam",
  Boolean(lodeAdd && cardMatchesSearch(c("Primite Drillbeam", "Spell Card", { archetype: "Primite" }), lodeAdd)),
);
check(
  "lode add except self",
  Boolean(lodeAdd && !cardMatchesSearch(c("Primite Lordly Lode", "Spell Card", { archetype: "Primite" }), lodeAdd)),
);
const lodeSs = parseAllSearchSpecs(
  "Special Summon 1 declared Normal Monster from your hand, Deck, or GY in Defense Position",
);
check(
  "lode ss multi source def",
  Boolean(
    lodeSs[0] &&
      lodeSs[0].dest === "summon" &&
      lodeSs[0].normalMonster &&
      lodeSs[0].position === "def" &&
      lodeSs[0].sources.includes("hand") &&
      lodeSs[0].sources.includes("deck") &&
      lodeSs[0].sources.includes("gy"),
  ),
);
check(
  "lode ss match DM",
  Boolean(lodeSs[0] && cardMatchesSearch(c("Dark Magician", "Normal Monster", { race: "Spellcaster", level: 7 }), lodeSs[0])),
);
check(
  "lode ss no effect mon",
  Boolean(lodeSs[0] && !cardMatchesSearch(c("Ash Blossom & Joyous Spring", "Effect Monster"), lodeSs[0])),
);
void lodeText;

const soul =
  'Place 1 card on top of the Deck from your hand, Deck, or GY, that is "Dark Magician" or specifically lists "Dark Magician" or "Dark Magician Girl" in its text, except "Soul Servant". During your Main Phase: You can banish this card from the GY; draw cards equal to the number of "Palladium" monsters.';
const soulSpec = parseSearchSpec(soul);
check("soul servant dest top-deck", Boolean(soulSpec && soulSpec.dest === "top-deck"));
check(
  "soul servant sources",
  Boolean(soulSpec && soulSpec.sources.includes("deck") && soulSpec.sources.includes("hand") && soulSpec.sources.includes("gy")),
);
check("soul servant except self", Boolean(soulSpec && soulSpec.exceptNames.includes("Soul Servant")));
check(
  "soul servant matches DM",
  Boolean(soulSpec && cardMatchesSearch(c("Dark Magician", "Normal Monster"), soulSpec)),
);
check(
  "soul servant matches mention",
  Boolean(
    soulSpec &&
      cardMatchesSearch(
        c("Magician's Rod", "Effect Monster", {
          desc: 'When this card is Normal Summoned: You can add 1 Spell/Trap that mentions "Dark Magician" from your Deck to your hand.',
        }),
        soulSpec,
      ),
  ),
);
check(
  "soul servant excludes self",
  Boolean(soulSpec && !cardMatchesSearch(c("Soul Servant", "Spell Card", { desc: soul }), soulSpec)),
);
check(
  "soul servant no ash",
  Boolean(soulSpec && !cardMatchesSearch(c("Ash Blossom & Joyous Spring", "Effect Monster", { desc: "When a card or effect is activated..." }), soulSpec)),
);

const diabellSet =
  'If this card is Normal or Special Summoned: You can Set 1 "Sinful Spoils" Spell/Trap directly from your Deck.';
const diabellSpecs = parseAllSearchSpecs(diabellSet);
check("diabellstar one set spec", diabellSpecs.length === 1);
check("diabellstar set dest", Boolean(diabellSpecs[0] && diabellSpecs[0].dest === "set-st" && diabellSpecs[0].archetypes.includes("Sinful Spoils")));

const dmodText =
  'If this card is Special Summoned: You can add 1 card from your Deck or GY that mentions "Dark Magician" to your hand, except "Dark Magician of Destruction".';
const dmod = parseSearchSpec(dmodText);
check("dmod dest hand multi source", Boolean(dmod && dmod.dest === "hand" && dmod.sources.includes("deck") && dmod.sources.includes("gy")));
check("dmod is mention search", Boolean(dmod && dmod.mentionsNames?.includes("Dark Magician")));
check("dmod except self", Boolean(dmod && dmod.exceptNames.includes("Dark Magician of Destruction")));
check(
  "dmod matches rod (mentions DM)",
  Boolean(
    dmod &&
      cardMatchesSearch(
        c("Magician's Rod", "Effect Monster", {
          desc: 'When this card is Normal Summoned: You can add 1 Spell/Trap that mentions "Dark Magician" from your Deck to your hand.',
        }),
        dmod,
      ),
  ),
);
check(
  "dmod matches circle",
  Boolean(
    dmod &&
      cardMatchesSearch(
        c("Dark Magical Circle", "Spell Card", {
          desc: 'When this card is activated: Look at the top 3 cards of your Deck, then you can reveal 1 "Dark Magician" or 1 Spell/Trap that mentions "Dark Magician" among them.',
        }),
        dmod,
      ),
  ),
);
check("dmod matches DM itself by name", Boolean(dmod && cardMatchesSearch(c("Dark Magician", "Normal Monster"), dmod)));
check(
  "dmod excludes self",
  Boolean(dmod && !cardMatchesSearch(c("Dark Magician of Destruction", "Fusion Monster", { desc: dmodText }), dmod)),
);
check(
  "dmod no ash",
  Boolean(dmod && !cardMatchesSearch(c("Ash Blossom & Joyous Spring", "Effect Monster", { desc: "When a card or effect is activated..." }), dmod)),
);

const rodText = 'When this card is Normal Summoned: You can add 1 Spell/Trap that mentions "Dark Magician" from your Deck to your hand.';
const rodSpec = parseSearchSpec(rodText);
check("rod mention spell-trap", Boolean(rodSpec && rodSpec.typeHint === "spell-trap" && rodSpec.mentionsNames?.includes("Dark Magician")));
check(
  "rod matches salvation",
  Boolean(
    rodSpec &&
      cardMatchesSearch(
        c("Magician's Salvation", "Spell Card", {
          desc: 'When this card is activated: You can Set 1 "Eternal Soul" directly from your Deck. If you Normal or Special Summon "Dark Magician" or "Dark Magician Girl": You can target 1 card your opponent controls; destroy it.',
        }),
        rodSpec,
      ),
  ),
);
check("rod excludes DM monster", Boolean(rodSpec && !cardMatchesSearch(c("Dark Magician", "Normal Monster"), rodSpec)));

const hallowed =
  'Reveal 1 "Azamina" Fusion Monster in your Extra Deck, and for every 4 Levels it has (round down), send 1 "Sinful Spoils" card from your hand and/or field to the GY (if face-down, reveal it), then Special Summon that revealed monster. (This is treated as a Fusion Summon.)';
const hal = parseAllSearchSpecs(hallowed);
check("hallowed one reveal-ss spec", hal.length === 1 && hal[0]!.dest === "summon" && hal[0]!.source === "extra");
check("hallowed azamina arch", Boolean(hal[0]?.archetypes.includes("Azamina") && hal[0]?.extraKinds.includes("fusion")));
check("hallowed scaled send", Boolean(hal[0]?.sendPerLevels?.divisor === 4 && hal[0]?.sendPerLevels?.archetypes.includes("Sinful Spoils")));
check(
  "hallowed matches ilia",
  Boolean(hal[0] && cardMatchesSearch(c("Azamina Ilia Silvia", "Fusion Monster", { archetype: "Azamina", level: 6 }), hal[0]!)),
);
check(
  "hallowed no dm fusion",
  Boolean(hal[0] && !cardMatchesSearch(c("Dark Magician the Dragon Knight", "Fusion Monster", { archetype: "Dark Magician", level: 8 }), hal[0]!)),
);

let fail = 0;
for (const x of cases) {
  if (!x.ok) {
    fail += 1;
    console.error("FAIL", x.name);
  }
}
if (fail) {
  console.error(fail, "search parse failures");
  process.exit(1);
}
console.log(`ok — ${cases.length} search checks`);
