# Daily Stat Clash

A publicly accessible daily character-stat matchup game. Players register with a username and password, then choose six unique fighters across six hidden-stat categories. Submitted lineups are paired after midnight in Istanbul and saved on an all-time leaderboard.

## Public frontend

[Open the GitHub Pages interface](https://einsche.github.io/Daily-Stat-Clash/)

The static frontend is publicly available. **Registration and login will not become functional until the standalone game server is deployed and connected to the frontend.** A static GitHub Pages repository cannot safely host shared user accounts or a persistent database.

## Production architecture — no Supabase

- `web/`: GitHub Pages interface, responsive desktop/mobile layout.
- `server/index.js`: Node.js HTTP server and REST API; also hosts the same interface directly at `/Daily-Stat-Clash/`.
- `server/game.js`: username/password accounts, scrypt password hashing, 256-bit session tokens, daily picks, UTC+3 settlement and leaderboards.
- `server/schema.sql`: local persistent SQLite database schema.
- `server/test/game.test.js`: live HTTP and database integration tests.
- `Dockerfile` and `railway.json`: deployment on Railway with a persistent SQLite volume.
- `app/`: archived source of the original TanStack/Cloudflare implementation and the 101 character definitions/portraits. Not used as the live backend.

**There is no external authentication provider, no Supabase and no email requirement.**

## Go live on Railway

A secure shared login requires an always-on server with a writable persistent volume. Railway is the recommended hosting provider for this code.

1. Connect a Railway account and link the GitHub repository `Einsche/Daily-Stat-Clash`.
2. Deploy from the repository root using the provided `Dockerfile`.
3. Attach a **persistent volume** at `/data` and set environment variable `DB_PATH=/data/daily-stat-clash.sqlite`. The database must never live solely on an ephemeral container filesystem.
4. Set `PUBLIC_WEB_ORIGIN=https://einsche.github.io` to allow the GitHub Pages frontend to call the Railway API. Generate a public Railway service domain and enable HTTPS.
5. The Railway service will host the complete game at `https://<YOUR-RAILWAY-DOMAIN>/Daily-Stat-Clash/` and expose API endpoints under `/Daily-Stat-Clash/api/`.
6. Edit `web/config.js`: `apiBase: 'https://<YOUR-RAILWAY-DOMAIN>/Daily-Stat-Clash'` (no trailing slash). GitHub Pages will then support registration/login against the same server.

Note: `<YOUR-RAILWAY-DOMAIN>` is a placeholder; use the real public domain assigned by Railway, not a guessed URL. Railway may require an account and payment method.

[Deployment details](server/README.md) · [Frontend configuration](web/README.md)

## Authentication

Registration uses a unique username (3–22 ASCII letters/digits/underscore/hyphen) and a password (10–72 UTF-8 bytes). Passwords are stored using scrypt with per-account random salts, not plaintext. The database stores only SHA-256 hashes of random 256-bit session tokens. Login attempts are throttled and sessions expire after 30 days.

Email is neither requested nor used. There is no automatic forgotten-password recovery, so users need to remember their passwords. For broad public release, an admin-assisted or recovery-code flow and stronger abuse protection should be added.

## Daily game rules

- 101 original fictional characters in 12 worlds.
- One randomly drawn character at a time; assign it to an unused stat.
- Stats: Strength, Dexterity, Battle IQ, Endurance, Hacks, IQ.
- Submit all six choices to lock in the lineup for the Istanbul day.
- Players are paired deterministically at midnight (00:00 Europe/Istanbul); the greater hidden value wins +1 per stat, ties award no point.
- If the number of participants is odd, one player receives a bye (no score that day).
- Weekly, monthly and all-time rankings plus match history persist in SQLite.
- Settlement retries automatically after an outage.

## Test locally

Node.js 24 or later:

```sh
npm test
DB_PATH=./data/daily-stat-clash.sqlite npm start
```

Open [http://localhost:3000/Daily-Stat-Clash/](http://localhost:3000/Daily-Stat-Clash/). The test suite uses temporary SQLite databases and does not touch production accounts.

Security caveat: the original scores are visible in the public Git repository's character dataset and earlier history. Before a competitive release, replace the public scoring seed with confidential scoring data. Do not commit live passwords, session tokens, volumes, or database files.
