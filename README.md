# Daily Stat Clash

A browser-based daily crossover stat matchup game featuring 160 characters from Hunter x Hunter, Naruto, DC, Marvel, The Witcher, Jujutsu Kaisen, Attack on Titan and Bleach.

## Play the three-guest local league

**Public site:** https://einsche.github.io/Daily-Stat-Clash/

Create **Guest 1**, **Guest 2**, and **Guest 3** on the same browser/device. Each guest receives a different random nickname and has an independent daily lineup. Select the guest's slot to switch between players. Existing one-guest data migrates into Guest 1 where valid.

For each guest:
1. An unused random character appears automatically.
2. Place it in one of six open stat slots: Strength, Dexterity, Battle IQ, Endurance, Hacks, IQ.
3. A new character automatically appears until six unique characters have been assigned.
4. Press Submit to lock that guest's lineup.
5. Switch to the next guest. After **all three have submitted**, press **Calculate Matchups** to run the local matchups immediately for testing. Otherwise, lineups settle at midnight in Istanbul (21:00 UTC).

## Local matchup and score rules

With exactly three submitted guests, the local league generates **three one-on-one matches** (Guest 1 vs 2, Guest 1 vs 3, Guest 2 vs 3). Each match compares the character assigned to **the same stat** in both submitted lineups.

- Higher stat value: **+1 point** for its player.
- Equal stat value: **0 points** for both players.
- Six comparisons per match. Each guest participates in two matches, and can score **0–12 local points per day**.
- Match results display the two fighters, numeric stat values, winning comparisons and each match's score.
- Local weekly, monthly and all-time rankings sum points across resolved matches.
- Results and lineups persist using browser localStorage across reloads. Daily rounds reset at **00:00 Europe/Istanbul**, while previous results remain in history. Resolving an already completed day never awards points twice.

The immediate Calculate Matchups control is for local three-guest testing; the scheduled midnight settlement remains supported. This is a local round-robin adaptation to give all three players a matchup, not a claim that the future live online matching system uses three-way leagues.

## Deployment and data

- `web/index.html`, `web/styles.css`, `web/app.js`: static GitHub Pages frontend for three local guests.
- `web/matchup-engine.js`: pure deterministic per-stat scoring engine and time-bounded local leaderboards.
- `web/guest-roster.json`: the 160 public character identities and universes.
- `web/guest-score-map.json`: the six numerical values for all 160 characters. This file is **public and inspectable** because a static browser-only game has no server-side secret scoring.
- `app/src/data/characters.json`: same 160 characters and scores in original source.
- `server/`: optional standalone Node.js / SQLite online backend and API, **not deployed** for the guest game.

No login, passwords, emails, Supabase or other database provider are needed to try the current 3-player local game. The three guest identities and all matches exist only in the current browser; other devices do not share them.

## Tests

Run `npm test` using Node 24+. Tests verify creation, separation and persistence of all three guests, 18 daily stat assignments, three pairwise results, stat wins/ties, result history, local leaderboard periods, and automatic Istanbul midnight rollover.

## Copyright and competitive fairness

Characters and world names belong to their respective owners. Official franchise artwork is not included. Characters are shown with initials and universe-colored visual treatments. The six stats are game-design estimates, not official canon values. Any future competitive or commercial launch needs a rights review and server-side private scoring rules; browser-only scores cannot be hidden from users.
