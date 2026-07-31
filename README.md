# Duel Lab

Local-first web playtest table for Yu-Gi-Oh **deck testing**. Unofficial fan tool. Not affiliated with Konami, NAS, or Master Duel. No monetization.

## What you get

- Full current card list cached locally (YGOPRODeck API)
- Master Duel-style deck builder + TCG/MD July 2026 premade meta snapshots
- Lab notes + `.ydk` import/export
- Local 2-player **hotseat** playmat (drag cards, LP, phases, dice/coin, tokens, undo)
- **Chain helper** (Spell Speed, SEGOC, FET boxes, likely activations)
- **Synergy / PSCT** tabs (what cards name each other, deck gaps)
- Deck diff + combo sandbox + rules cheat sheet
- Serializable game state ready for online rooms later

Effects are **manual** on purpose — like paper proxies.

## Run

```bash
cd ~/Documents/duel-lab
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

First visit: go to **Settings** or Home → **Sync card database**. The first sync can take a minute.

## Shared test link (deploy)

Testing only — one small always-on box so you and a friend share the same room list.

```bash
# one-time
curl -L https://fly.io/install.sh | sh
export FLYCTL_INSTALL="$HOME/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"
fly auth login
cd ~/Documents/duel-lab
fly launch --copy-config --yes --no-deploy
fly deploy
fly apps open
```

Then both of you open **`https://duel-lab-test.fly.dev/play/room`** (or the URL `fly apps open` shows). Host creates a room, guest joins with the code.

Stop it when you’re done testing:

```bash
fly scale count 0
# or: fly apps destroy duel-lab-test
```

## Duel a friend (online room)

Rooms already exist: **Play → Duel a friend** (`/play/room`). One of you hosts, the other joins with a 6-letter code. Each person picks their own deck (saved locally or a premade). Coin flip + first/second happens in the room lobby.

**Same Wi‑Fi**

```bash
npm run dev:lan
```

On the host Mac, get your LAN IP:

```bash
ipconfig getifaddr en0
```

Share `http://YOUR_LAN_IP:3000/play/room`. Friend joins that URL, enters the room code.

**Different networks (easiest)**

Keep `npm run dev` (or `dev:lan`) running, then in another terminal expose port 3000:

```bash
# Cloudflare (free, no account required for a quick tunnel)
npx --yes cloudflared tunnel --url http://localhost:3000
```

or

```bash
npx --yes localtunnel --port 3000
```

Send your friend the `https://…` URL + the room code. Both should open **Settings → Sync card database** once before dueling.

Notes:

- Rooms live in the Node process memory — don’t restart `npm run dev` mid-duel.
- The board syncs about every 0.7s. Search/cost popups run on the player taking the action.
- This is not matchmaking or a public server; it’s a private room for two browsers.

Card art is matched by **passcode** from YGOPRODeck `card_images` (exact id, then listed alt, never by name). Images are downloaded into `data/cache/images/` on first view. Optional: Settings → Prefetch all small card art.

## Layout

Project lives at `~/Documents/duel-lab` so it stays out of other work.

See `docs/ARCHITECTURE.md` for internals.

## Not in v1

- Automated ruling engine
- Online matchmaking
- Official card artwork
- Ranked / gems / cosmetics
