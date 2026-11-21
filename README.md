# Daily Stat Clash

A crossover daily-character stat game. The current public release uses **Play as Guest**: no login, password, registration or email.

**Play:** https://einsche.github.io/Daily-Stat-Clash/

## Current crossover character database

The active character pool has been completely replaced. There are **160 characters from 8 universes**, 20 from each:

| Universe | Characters |
|---|---:|
| Hunter x Hunter | 20 |
| Naruto | 20 |
| DC | 20 |
| Marvel | 20 |
| The Witcher | 20 |
| Jujutsu Kaisen | 20 |
| Attack on Titan | 20 |
| Bleach | 20 |
| **Total** | **160** |

The full roster in `app/src/data/characters.json` contains original game-design estimates for **Strength, Dexterity, Battle IQ, Endurance, Hacks and IQ** (0–100). These scores are fan-created balance data, **not official canon measurements**. `web/guest-roster.json` contains only public IDs, character names and universe names; scores aren't transmitted by the guest interface.

This update retires all 101 original characters from the active pool. Franchise-specific portraits have not been licensed or included; the guest interface uses color-coded universe backdrops and character initials rather than showing incorrect portraits.

## Guest play

Tap **PLAY AS GUEST** to automatically generate a random nickname and draw the first character. Assign it to a stat to receive the next character, until all six categories are filled. Submit to lock the daily lineup; the next day resets at midnight Istanbul time.

The browser stores its nickname, current draw, daily picks and previous submissions locally. When the character-roster revision changes, past selections and guest history are intentionally reset to prevent retired character IDs from remaining in play. Nicknames are preserved.

This is currently a **local-only guest mode**. Actual head-to-head matchmaking, global scores and live leaderboards are not running and are never fabricated.

## Data synchronization

- `web/guest-roster.json`: active identity-only roster, 160 entries.
- `app/src/data/characters.json`: full 160-character dataset and six numeric ratings.
- `server/schema.sql`: optional Node.js/SQLite multiplayer backend schema.
- `server/game.js`: on the next server start, compares a hash of the full roster; when changed, transactionally removes previous selections/matches and characters, then inserts the new 160. Existing username/password accounts are preserved.
- `web/app.js`: client-side roster-revision reset for guest selections and histories.
- `.github/workflows/pages.yml`: GitHub Pages publishing with the new roster (old portraits are no longer published).

## Validation and testing

`npm test` runs guest-mode interaction tests and Node.js/SQLite backend integration tests, including roster migration. GitHub Actions also checks exact counts and eight-universe distribution.

## Rights and commercial launch

Hunter x Hunter, Naruto, DC, Marvel, The Witcher, Jujutsu Kaisen, Attack on Titan and Bleach are third-party intellectual properties. This repository does **not** include their official artwork. Public commercial use of their characters and names may require appropriate permissions or licenses.

Numeric scores are committed in the publicly accessible source repository. For any competitive release, move confidential scoring data to private storage and rotate the published values.
