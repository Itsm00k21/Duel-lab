# Duel Lab architecture

Local-first playtest app. Online rooms are not implemented yet; the game model is ready for them.

## Folders

```
src/
  app/                 Next.js routes + API
    api/cards/         YGOPRODeck proxy + disk cache
    decks/             Deck list + editor
    play/              Setup + table
    lab/               Diff + combo sandbox
    settings/
  components/
  lib/
    cards/             Compact card types, search
    deck/              Formats, .ydk, validation
    game/              Pure GameState + reducer (MP foundation)
    rules/             PSCT parse, Spell Speed, chain, FET scan
    synergy/           Quote/archetype graph + staple roles
    db/                IndexedDB (Dexie)
  store/               Zustand stores
data/cache/            Server-side compact card dump (gitignored)
docs/
```

## Data flow

1. Client asks `/api/cards/sync`.
2. Server checks YGOPRODeck `checkDBVer.php`.
3. On miss, downloads `cardinfo.php?misc=yes`, compacts records, optional Genesys merge, writes `data/cache/`.
4. Client stores cards in IndexedDB and keeps them in memory via `useCardStore`.

## Game state

`GameState` is plain JSON:

- two players, piles + 5 M zones + 5 S/T + field + 2 EMZ
- phases, LP, log, notes, view mode
- `reduce(state, action)` is the only mutator

Later, a socket room can broadcast `GameAction` values and keep one reducer on the server or in each client.

## Legal posture

Unofficial, private, non-commercial. No Konami branding. No bundled official art. Manual effect resolution.
