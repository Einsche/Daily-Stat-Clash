# Stat Clash — Daily Character Matchup

An independent daily drafting game using React 19, TanStack Start, Cloudflare Workers and D1/SQLite.

## Gameplay

- Accounts: username + password; PBKDF2-SHA256 with per-account salt, secure HTTP-only session cookies, rate-limited auth.
- Each Istanbul calendar day a signed-in user receives one random character at a time. Their current draw is persisted server-side and cannot be rerolled.
- Choose a different slot among Strength, Dexterity, Battle IQ, Endurance, Hacks and IQ for each character. The six picks use unique characters, cannot be changed, and require explicit submission.
- At midnight Istanbul time, submitted lineups are paired in a reproducible daily shuffle. Each of six corresponding stats is compared. Higher rating gains +1; ties +0. One opponent per daily round; an odd player gets a bye.
- Results saved in `stat_matchups`; scores aggregated into weekly/monthly/all-time leaderboards and individual permanent history. Historical rating values are snapshotted in each duel record.
- During selection, read requests contain names and images, **never hidden ratings**. On settlement, past result ratings become visible in history.

## Source and roster

`src/data/characters.json` contains a temporary, original 101-character roster across 12 original fantasy realms. Data seeding lives in `migrations/0002_game.sql`. The hosting platform rejected the requested copyrighted anime/manga character data. This production demo therefore uses original characters and 101 original SVG portraits, not the user-specified copyrighted universe roster. All six 0–100 ratings are editorial balancing values. `Hacks` means extraordinary abilities, not computer hacking. Replace the roster only when rights/licensing allow it on the intended host.

## Hosting

- `app.manifest.json` opts into Cloudflare D1. Migrations are applied on deploy.
- `src/server.ts` handles `/api/game` GET and POST directly before the SSR router because the hosted build process cannot regenerate the file-route type registry.
- All data changes are validated server-side. Never expose credentials or hidden scores in client API responses.
- The site **self-settles** outstanding days on the first GET after midnight. To ensure a settlement attempt at exactly midnight, configure a scheduler to GET `/api/game` at `21:00 UTC` daily (Istanbul is UTC+3 year-round). Cloud job scheduling can run late: a visit to the site also performs catch-up settlement. The daily calculation is idempotent.
- GitHub Actions schedule skeleton in `.github/workflows/daily-settlement.yml` runs only when this source is mirrored to a GitHub repository. Do not assume the website platform's Git store is a public GitHub repository.

## Public-data caveat

A publicly accessible code repository containing `0002_game.sql` discloses the six subjective character ratings. Gameplay only hides them in the browser; security against motivated players would require keeping ratings in a **private** data source (and publishing only source code without rating seeds). Do not claim the values are secret when the seed is publicly visible.

## Operational decisions

- Matchmaking model: one opponent per player per day, not global round-robin. Maximum 6 points per day. Odd participants do not receive free wins.
- Weekly begins Monday 00:00 Europe/Istanbul; monthly begins day 1.
- Registration has basic abuse limits but does not implement email verification or multifactor auth; add those before a large-scale launch.
