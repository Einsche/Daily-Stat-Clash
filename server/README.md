# Daily Stat Clash: Node.js / SQLite API

No Supabase and no third-party authentication. Everything runs in one Node.js 24 service with persistent SQLite. The app uses built-in Node modules only, so `npm install` is unnecessary.

## Start locally

```sh
npm test
DB_PATH=./data/daily-stat-clash.sqlite npm start
```

Open http://localhost:3000/Daily-Stat-Clash/. Health: http://localhost:3000/Daily-Stat-Clash/api/health.

## Railway production deployment

- Connect GitHub repository `Einsche/Daily-Stat-Clash` to a Railway service.
- Build using the root `Dockerfile` (configured in `railway.json`).
- Mount a persistent Railway **volume at `/data`**.
- Set `DB_PATH=/data/daily-stat-clash.sqlite` and `NODE_ENV=production`.
- Keep the service at **one replica** for local SQLite.
- Generate a public service domain (HTTPS) using Railway's network settings. The app will be at `https://<YOUR-DOMAIN>/Daily-Stat-Clash/`.
- For the separate GitHub Pages frontend set `PUBLIC_WEB_ORIGIN=https://einsche.github.io`, then set `web/config.js` `apiBase` to `https://<YOUR-DOMAIN>/Daily-Stat-Clash`.

The mounted volume must persist across releases. The Docker image itself is stateless; do not store production account data on its ephemeral filesystem. Back up the volume regularly. Avoid committing live SQLite database files to Git.

## API (JSON)

All routes begin with `/Daily-Stat-Clash/api`.

| Method | Path | Authentication |
| --- | --- | --- |
| POST | /auth/register | username and password in JSON |
| POST | /auth/login | username and password in JSON |
| POST | /auth/logout | Bearer session token |
| GET | /state | Optional Bearer session token |
| GET | /leaderboard?period=weekly | Public |
| POST | /draw | Bearer token |
| POST | /assign | Bearer token and JSON stat |
| POST | /submit | Bearer token |
| GET | /health | Public |

Username uniqueness is case-insensitive. Passwords are scrypt-hashed with random salts and are never returned or saved in the browser. Tokens are 256-bit random strings with SHA-256 digests stored in SQLite, expiring after 30 days. Login throttle: eight wrong passwords per username temporarily lock login; HTTP requests also have basic per-IP rate limiting.

Daily settlement runs every 15 seconds as a catch-up check and on game requests; it handles 00:00 Europe/Istanbul, process restarts and downtime. Submitted lineups are immutable. Completed match results and rankings persist.

### Important

- The original character stat values are publicly committed in the source roster, so competitors can inspect them. Move scores to a genuinely private seed before competitive launch.
- Without email, users cannot self-reset forgotten passwords. Admin recovery or recovery codes would be needed.
- Consider edge firewall, bot protection, distributed/IP rate limiting, observability, backups, and identity abuse safeguards for large-scale traffic.
