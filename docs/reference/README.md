# Duel Lab rules reference (audit pack)

Saved **before** any playmat rebuild. Unofficial fan notes. Not Konami, not a substitute for the rulebook.

**Not from Master Duel ROM dumps.** Card names/status come from our YGOPRODeck compact cache + premade lists. Rule deltas come from public TCG/OCG docs.

| File | What it is |
| --- | --- |
| [TCG-VS-MASTER-DUEL.md](./TCG-VS-MASTER-DUEL.md) | Format + ruling differences we must respect |
| [ENGINE-CAPABILITIES.md](./ENGINE-CAPABILITIES.md) | What the Lab actually simulates vs still-manual |
| [card-coverage.md](./card-coverage.md) | Human list of premade-pool ok / partial / gap |
| [card-coverage.json](./card-coverage.json) | Same data, machine-readable |
| [../RULES.md](../RULES.md) | Older helper notes + trigger audit |

Regenerate coverage:

```bash
npx tsx scripts/dump-card-reference.ts
npx tsx scripts/check-deck-coverage.ts
```

Rebuild the table UI **only after** this pack is accepted.
