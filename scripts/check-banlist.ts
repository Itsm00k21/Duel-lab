import { applyCardLegalityFixes } from "../src/lib/cards/legality";
import { MD_BANLIST_EFFECTIVE, MD_FORBIDDEN, MD_LIMITED, MD_SEMI_LIMITED } from "../src/data/md-banlist";
import { TCG_BANLIST_EFFECTIVE, TCG_FORBIDDEN, TCG_LIMITED, TCG_SEMI_LIMITED } from "../src/data/tcg-banlist";
import { FORMATS } from "../src/lib/deck/formats";
import type { CompactCard } from "../src/lib/cards/types";
import { readFileSync } from "node:fs";

const cards = (JSON.parse(readFileSync("data/cache/cards.compact.json", "utf8")) as CompactCard[]).map(applyCardLegalityFixes);
const byName = new Map(cards.map((c) => [c.name.toLowerCase(), c]));

let fail = 0;
function check(name: string, cond: boolean) {
  if (!cond) {
    fail += 1;
    console.error("FAIL", name);
  }
}

check("tcg date", TCG_BANLIST_EFFECTIVE === "2026-05-18");
check("md date", MD_BANLIST_EFFECTIVE === "2026-07-27");
check("tcg sizes", TCG_FORBIDDEN.length > 100 && TCG_LIMITED.length > 80 && TCG_SEMI_LIMITED.length === 10);
check("md sizes", MD_FORBIDDEN.length > 90 && MD_LIMITED.length > 60 && MD_SEMI_LIMITED.length >= 15);

const maxx = byName.get('maxx "c"')!;
check("maxx tcg banned", maxx.banTcg === "Banned" && FORMATS.advanced.copiesFor(maxx) === 0);
check("maxx md limited", maxx.banMd === "Limited" && FORMATS["master-duel"].copiesFor(maxx) === 1);

const ash = byName.get("ash blossom & joyous spring")!;
check("ash unlimited both", !ash.banTcg && !ash.banMd);

const herald = byName.get("herald of the arc light")!;
check("herald tcg banned", herald.banTcg === "Banned");
check("herald md limited", herald.banMd === "Limited");

const fusion = byName.get("primite fusion")!;
check("primite fusion tcg+md pool", FORMATS.advanced.cardFilter!(fusion) && FORMATS["master-duel"].cardFilter!(fusion));

if (fail) {
  console.error(fail, "banlist checks failed");
  process.exit(1);
}
console.log(
  `ok — banlists TCG ${TCG_FORBIDDEN.length}/${TCG_LIMITED.length}/${TCG_SEMI_LIMITED.length} · MD ${MD_FORBIDDEN.length}/${MD_LIMITED.length}/${MD_SEMI_LIMITED.length}`,
);
