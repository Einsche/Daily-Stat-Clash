# Daily Stat Clash — standalone Node.js / SQLite backend

This optional backend is not deployed with GitHub Pages. The public site currently uses local guest mode only.

## Crossover roster

The full seed file is `app/src/data/characters.json`, with **160 characters** (20 from each of Hunter x Hunter, Naruto, DC, Marvel, The Witcher, Jujutsu Kaisen, Attack on Titan and Bleach). Every character has six subjective 0–100 game stats.

On startup, `server/game.js` computes a SHA-256 roster revision. If the database's revision differs, it resets the obsolete SQLite characters, pending selections, matchup results and settlement records in a single transaction, then seeds the new roster. User accounts and sessions remain intact. Unchanged revisions do not erase game records.

Franchise artwork is not included; the backend uses the game icon as a neutral portrait placeholder.

## Local development

Requires Node.js 24 or later. There are no third-party npm runtime dependencies.

```sh
npm test
DB_PATH=./data/daily-stat-clash.sqlite npm start
```

Open http://localhost:3000/Daily-Stat-Clash/. Health: http://localhost:3000/Daily-Stat-Clash/api/health.

## Future multiplayer deployment

Deploy the repository via `Dockerfile` to a Node.js host such as Railway. Mount a writable persistent volume at `/data`, set `DB_PATH=/data/daily-stat-clash.sqlite`, run a single SQLite replica and expose the app over HTTPS. Back up the persistent volume. The browser-based guest site does not currently communicate with this server.

## Security and licensing

The optional backend implements scrypt-hashed usernames/passwords, hashed 30-day bearer sessions, API rate limiting, and server-side scoring. Third-party character identities are used for illustrative crossover game data; actual commercial release may need licenses. The current score dataset is visible in the public Git repository and must be made confidential for fair real-money/competitive play.
