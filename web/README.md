# Daily Stat Clash — current public guest mode

https://einsche.github.io/Daily-Stat-Clash/

No Login / Create Account pages. Press **PLAY AS GUEST** and the browser creates a random nickname automatically. No email or password required.

The entire current guest experience runs on GitHub Pages without Supabase, Railway, Node.js hosting, or any other account/database provider. The browser loads `guest-roster.json` (101 characters, names/worlds/IDs only), draws one unused character at a time, and saves six distinct stat assignments in `localStorage`. Submitting locks today's selection. A new round begins at 00:00 Istanbul time. Previous guest submissions can be viewed locally.

**Limitations:** This is a single-browser guest mode. Opponent matching, shared account identity, cross-device synchronization, score calculation and global rankings are not enabled. Do not display guessed win totals.

The Node.js + SQLite backend remains in `server/` for a possible later full multiplayer release; the current public site makes no API calls to it. Scores are intentionally omitted from the static guest roster.

After changes to `web/`, GitHub Actions republishes the Pages site. The existing `.github/workflows/pages.yml` copies all 101 portraits to their required paths.
