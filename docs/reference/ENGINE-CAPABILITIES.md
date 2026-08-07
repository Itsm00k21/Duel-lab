# Engine capabilities vs honest gaps

Snapshot of Duel Lab **before** UI rebuild. Text + timing remain source of truth. Hide illegal when we can prove it; never show a fake “full script.”

## Enforced in `reduce` / helpers

| Area | Status | Where |
| --- | --- | --- |
| Phases DP→EP, turn count | yes | `engine.ts` |
| Draw for turn except first player T1 | yes | engine |
| No T1 attacks | yes | battle helpers |
| 1 NS/Set + tributes + granted extra NS | yes | `summonRules.ts` |
| Spell Speed + Counter-only on SS3 | yes | `chain.ts` `canChainSpeed` |
| SEGOC reminder buckets | **TCG only** | `segocOrder()` — not a full builder; **not OCG/MD** |
| FET box A/yellow/B/C/D/E | reminder + auto-skip empty | Playmat + `fetBox` |
| PSCT split `:` `;` | yes | `psct.ts` |
| One-shot S/T → GY after activation resolves | yes | chain `leavesTo` |
| Continuous/Field/Equip stay | yes | `stLifecycle.ts` |
| Set-this-turn Trap / QP (can’t activate same turn) | mostly | `setTurn` + activation window |
| Ash-style “when a card or effect is activated” | gated | `responseGate.ts` / legalResponses |
| Imperm from hand if you control no cards | gated | activationCondition |
| Veiler opponent MP | gated | activation window |
| Nibiru 5+ summons this turn | tracked | table summon count |
| OPT / hard OPT spend | partial | `MARK_EFFECT` — not every wording |
| Search / Set from Deck / excavate / declare name | partial | `searchEffect` + `effectOps` |
| Fusion/Ritual from Spell text | partial | `fusion-spell` / `ritual-spell` ops |
| Lingering EoT negate (Imperm/Veiler/Droplet-ish) | partial | `negatedUntilTurn` / `NEGATE_*` |
| Extra Deck materials from text | partial | `extraSummon.ts` |
| Fog of war online | yes | `sanitize.ts` |
| Manual illegal MOVE (GY dump, bounce) | blocked | `moveLegality.ts` |

## Still manual / incomplete (do not claim compliant)

- Full Damage Step sub-steps (start / calc / damage / end) and what may activate there  
- “Missing the timing” for **When** if something else is last to happen (prompt heuristic only)  
- OCG/MD SEGOC private-location bucket  
- Unaffected / “cannot be targeted” as a hard lock  
- Control change, tokens, counters, attach-equip as first-class ops  
- Place on bottom, shuffle-back-all, “destroy all … except”  
- Xyz rank-up / overlay properly beyond material picker  
- Attack-all / direct-attack grants as engine flags  
- Exact ATK/DEF compare (Bottomless 1500, etc.) on every card  
- Column / pointing / co-link checks for every Link  
- Pendulum scale legality beyond “this is a pendulum monster”  
- Replay in battle after field change  
- Public-knowledge hand (Maxx C reveal, etc.) online  
- Both players forming SEGOC in one yellow box without the coach prompt  

## Premade pool (this audit)

See [card-coverage.md](./card-coverage.md). Unique names in `PREMADE_DECKS` only — **364** cards, not the entire print history.

Approximate this pass:

- **ok** ~55–58% — activation window + parseable resolve (search/cost/ops)  
- **partial** ~33–36% — you can click Activate; some resolve lines still human  
- **gap** 5 cards — activatable text we don’t classify  
- **skip** ~29 — vanilla / reminder / pure continuous  
- **missing** 0 from DB  

Common leftover ops on partials: choice bullets, Damage Step lines, on-field negate variants, fusion-from-monster, bounce, equip-attach, bottom-deck, tokens, unaffected.

“100% runnable” on a deck row means every card is ok **or** partial (you can start the effect), **not** that every line auto-resolves.

## Rebuild rules (agreed)

1. Finish **format-true** SEGOC + banlist split before chrome overhaul.  
2. Never ship MD branding or dumped assets.  
3. Prefer hiding illegal over adding a “Pass” spam button.  
4. Re-run `dump-card-reference.ts` after parser work; treat JSON as the living gap list.  
