# TCG vs Master Duel — reference (not ROM data)

Sources (public):

- Konami TCG [Fast Effect Timing](https://www.yugioh-card.com/en/play/fast-effect-timing/)
- Konami TCG [Rulebook](https://www.yugioh-card.com/en/rulebook/)
- [Yugipedia: Simultaneous Effects (SEGOC)](https://yugipedia.com/wiki/Simultaneous_Effects_Go_On_Chain)
- [YGOPRODeck banlists](https://ygoprodeck.com/banlist/) (what the Lab loads)
- Community consensus that **Master Duel uses OCG-style chain construction**, not TCG SEGOC

Duel Lab formats today (`src/lib/deck/formats.ts`):

| Format id | Pool / copies | Master Rule | Notes |
| --- | --- | --- | --- |
| `advanced` | TCG legal + TCG F/L **2026-05-18** | 5 + EMZ | Paper Advanced |
| `master-duel` | MD pool + MD F/L **2026-07-27** | 5 + EMZ | **Banlist sandbox only** — engine still TCG-leaning |
| `no-ban` / `custom` | lab | 5 | House rules |
| `goat` / `edison` | era filters | 1 / 2 | No EMZ |

## Same in both (Master Rule 5)

These should stay identical unless a format toggle says otherwise:

- 8000 LP, draw 5, Extra Deck 15, Main 40–60, Side 0–15 (MD ranked often **no Side** — see below)
- Draw Phase draw (except first player turn 1)
- First player **cannot attack** on the first turn
- 1 Normal Summon/Set; tributes by level
- Spell Speed 1 / 2 / 3 matrix (SS1 cannot respond; only SS3 answers SS3)
- Fast Effect Timing boxes A → yellow triggers → B/C/D/E (TCG chart). MD uses the same *open game state* idea; trigger **ordering** differs
- Problem-Solving Card Text (`:` cost `;` activation, then resolution)
- One-shot Spells/Traps go to GY after their activation resolves (even if the effect is negated). Continuous / Field / Equip stay
- “If” vs “When” missing the timing (last thing to happen)
- Once per turn / hard OPT / once while face-up
- Damage Step restrictions (limited activations)
- Link arrows, Extra Monster Zones, co-linked, Extra Deck summons need proper materials
- Pendulum: scales in leftmost/rightmost S/T, pendulum summon once per turn from hand + Extra face-up

## Different — must be a **format flag** before rebuild

### 1. SEGOC / simultaneous triggers (biggest engine delta)

**TCG** (Yugipedia + TCG rulebook):

1. Turn player mandatory  
2. Opponent mandatory  
3. Turn player optional  
4. Opponent optional  

Within a bucket, that player chooses order.

**OCG / Master Duel:**

1. All **mandatory** triggers (either player; controller chooses order among theirs)  
2. Optional triggers that are **public** (face-up field / GY / public knowledge)  
3. Optional triggers that are **private** (hand / Set) — these are treated closer to fast effects for chaining

Practical MD/OCG result: a hand trigger like a “when you take damage: SS this from hand” sits in a **later** bucket than a public GY trigger. In TCG the same hand trigger is just “optional, that player’s bucket.”

Lab today: `segocOrder()` in `src/lib/rules/chain.ts` is **TCG buckets**. Prompts are not a full SEGOC builder. **MD format still uses TCG order.** Non-compliant for a real MD sandbox.

Rebuild requirement: `format.segoc: "tcg" | "ocg"`.

### 2. Banlists & card pool

Not the same Forbidden/Limited. Same name can be 3-of in TCG and 1-of in MD (or unreleased). Lab already splits `banTcg` vs `banMd` from YGOPRODeck. Rebuild must keep **two lists**, never mix mid-duel.

Unreleased-in-TCG OCG cards can appear in MD; TCG Advanced filter must keep excluding them.

### 3. Match structure (table vs ranked)

| | TCG Advanced event | Master Duel ranked |
| --- | --- | --- |
| Match | Best of 3 typical | Best of 1 |
| Side Deck | Yes, between games | **No side** in ranked BO1 |
| Time | Match clock (e.g. 40+ min) | Per-turn timer (~150s action + animations) |
| Going first | Dice/coin + choose | Coin/choose (we already have this) |

Lab is a playtest table: **no timers required**. For MD sandbox: hide Side or ignore it. For TCG: keep Side.

### 4. PSCT language

TCG English text vs MD (often closer to OCG wording). Same card id can have slightly different conjunctions historically; current YGOPRODeck `desc` is usually TCG English even for MD pool. **Do not assume MD in-game English matches TCG word-for-word.** For Lab, one text source (YGOPRODeck) is OK if we label it.

### 5. Questionable / often confused (document, don’t invent)

- **Ash / Called by / Crossout** — same cards, different lists and sometimes different “name” status
- **Maxx “C”** — legal in MD, banned in TCG Advanced (as of our loaded lists; always re-check)
- **Hand loop / Maxx C challenge** — MD culture, not a rule difference
- **Replay / replay after leaving the field** — same Master Rule 5
- **Xyz materials under a monster that changes control** — same
- **Tokens** — same (can’t be used as Xyz material, etc.)

Re-check ban status from YGOPRODeck before claiming a specific staple is legal.

### 6. What Master Duel automates that paper/Lab does not

MD is a video game: illegal activations never light up; missing the timing is forced; OPT is tracked; materials are validated; Damage Step is locked.

Lab is a **paper proxy + coach**. Rebuild should *hide illegal* when we can prove it (we already try) and **never fake** a full Konami script layer.

## Compliance checklist for rebuild

- [ ] `advanced` duels use TCG SEGOC + TCG F/L + Side Deck allowed  
- [ ] `master-duel` duels use OCG SEGOC + MD F/L + no ranked Side  
- [ ] FET chart remains TCG official boxes; only trigger **order** switches  
- [ ] First-turn attack lock + no turn-1 draw for going first  
- [ ] Spell Speed matrix unchanged  
- [ ] No Konami logos, no ripped MD 3D/SFX; original chrome only  
- [ ] Banlists refresh from YGOPRODeck, dates recorded in format description  

## Intentionally out of scope (this pack)

- Extracting anything from `.nsz` / Switch dumps  
- Copying MD UI assets or exact Konami HUD art  
- Simulating ranked MMR, solo gates, secret packs  
