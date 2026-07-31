# Rules sources used by Duel Lab

This app is a **manual** playtest table with helpers. It does not auto-resolve effects.

## Primary references

- [Konami Fast Effect Timing PDF](https://www.yugioh-card.com/ygo_cms/ygo/all/uploads/FastEffectTiming_for_webpage-1.pdf)
- [Yugipedia: Chain](https://yugipedia.com/wiki/Chain)
- [Yugipedia: Fast Effect Timing](https://yugipedia.com/wiki/Fast_Effect_Timing)
- [Yugipedia: SEGOC](https://yugipedia.com/wiki/Simultaneous_Effects_Go_On_Chain)
- [Yugipedia: Spell Speed](https://yugipedia.com/wiki/Spell_Speed)
- [Yugipedia: Problem-Solving Card Text](https://yugipedia.com/wiki/Problem-Solving_Card_Text)
- [YGOPRODeck API v7](https://ygoprodeck.com/api-guide/) for card data / archetypes / banlists / Genesys points

## What the helper enforces

- **One Normal Summon/Set per turn** (tributes for Lv5+). Extra NS only if an effect grants it (Double Summon text, etc.) or you pick **Effect Special Summon**
- Spell Speed response matrix (SS1 cannot respond; only SS3 answers SS3)
- SEGOC bucket order reminder (TCG)
- FET box reminder (A / yellow / B / C / D / E) — tucked under Chain → Advanced
- PSCT split on `:` and `;`
- Auto FX prompts only for **If/When/Standby/End** trigger windows that match the live event
- Quoted-name + archetype + Level/Attribute/Type search pickers (sequential `then` searches)
- Set-from-Deck (Magician's Salvation) and Magician Navigation SS chain
- One-shot Spells/Traps (Normal / Ritual / Quick-Play / Normal & Counter Trap) go to the GY after activation resolves — even if Ash negated the effect. Continuous / Field / Equip stay.
- Draw 1 at the start of each turn except the opening turn of the player who goes first
- No attacks on the very first turn of the duel; each monster attacks once per Battle Phase
- Common staple roles (handtraps, breakers, floodgates)

## Auto FX audit (2026-07-31)

Checked against PSCT + real YGOPRODeck text (`scripts/audit-triggers.ts`).

Prompts **yes** when they should:

- Stratos / “If this card is Normal or Special Summoned”
- Sage with Eyes of Blue on **Normal Summon only**
- Sangan when **that** card hits the GY
- Torrential on a Summon
- Bottomless only on **opponent** Summons
- Ash from hand on **activation**, not on Summon
- Solemn Strike window on Special Summon text

Prompts **no** when they should stay quiet:

- Dark Magician / Dark Magician Girl (normal / continuous)
- Ignition “During your Main Phase: You can Special Summon…”
- Veiler / Maxx "C" / Nibiru (no 5-summon counter → we do not spam)
- Eternal Soul / Malicious GY ignition
- Imperm / Mirror Force on Summon
- Maiden “targets this card” without a targeting event

### Still manual (not simulated)

- ATK thresholds (Bottomless 1500+)
- “5 or more monsters this turn” (Nibiru)
- Once per turn / hard OPT already used
- Missing the timing on **When**
- Set-this-turn trap legality
- Attack declaration windows (Mirror Force)
- Exact targeting / column / archetype-on-field checks
- Every “you get an extra Normal Summon” card (common PSCT is detected; weird text stays manual via table tools if needed)

Toggle **Auto FX OFF** anytime. Re-run `npx tsx scripts/audit-triggers.ts` after matcher changes.

## Manual “Activate effect” (card menu)

The duel menu only offers **Activate effect** when a voluntary window looks live:

- Ignition: your Main Phase, open game state, correct zone
- Quick / handtraps: turn/phase text + Spell Speed + location
- Ash-style: a Chain must already be open
- Veiler: opponent’s Main Phase only
- Nibiru: opponent summoned 5+ this turn (table tracks summons)
- Imperm from hand: you control no cards
- If/When triggers: only in the yellow trigger window (or Auto FX prompt)

Uncheckable details (exact ATK, names, OPT already used) stay manual. Re-run `npx tsx scripts/check-activations.ts`.
