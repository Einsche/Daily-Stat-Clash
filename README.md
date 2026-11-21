# Daily Stat Clash

Daily six-character stat matchup game. Each day, players assign six distinct
hidden-stat characters to Strength, Dexterity, Battle IQ, Endurance, Hacks,
and IQ. Submitted lineups are matched for the day, with results and
historical leaderboards stored in a database.

## Source

- Application: `app/` — React 19, TanStack Start, Cloudflare Workers.
- Database: `app/migrations/` — Cloudflare D1 / SQLite.
- Daily settlement: configured after a public host is deployed.
- Character roster generator: `app/scripts/generate_roster.py`.
- Full project details: `app/README.md`.

## Deployment status

This is a source-code import, **not** a live deployment. The previous
Higgsfield deployment returns HTTP 401 for anonymous requests.
Reconfigure deployment, database bindings, and the scheduled settlement
URL before public production use. Account sign-up and sign-in have not
yet been verified on an independent host.

The currently included roster uses 101 original fantasy characters in
12 original worlds. It is not the requested licensed-franchise roster.

Bundled third-party binary font files were intentionally excluded.
