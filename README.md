# Daily Stat Clash

Daily six-character stat-selection game. The current public release uses guest mode: no sign-in, no registration, no passwords, and no email.

## Play

**Public URL:** https://einsche.github.io/Daily-Stat-Clash/

Click **PLAY AS GUEST**. The site immediately generates a random nickname such as `IronFalcon_4827`; no information needs to be entered. The nickname is saved in the browser and restored after a reload. Clicking **NEW RANDOM NAME** generates another nickname without erasing today's lineup.

Gameplay works without a backend:
- Draw characters from the full 101-character roster, one at a time.
- Assign exactly one character to each of Strength, Dexterity, Battle IQ, Endurance, Hacks, and IQ.
- The same character cannot be used twice.
- Submit six choices, which locks today's lineup.
- Guest progress and submission history are saved locally in the current browser.
- A new daily lineup becomes available at 00:00 Europe/Istanbul.

This temporary guest mode is **not multiplayer**: global leaderboards, actual opponent pairing, and scored match outcomes are inactive. The interface explicitly labels this limitation instead of displaying fake results. Browser storage can be cleared by the user or the device, so guest progress is not permanent across devices.

## Source layout

- `web/index.html`, `web/styles.css`, `web/app.js`: the current guest interface.
- `web/guest-roster.json`: public identity-only roster with no stat scores.
- `app/public/assets/portraits/`: all 101 character portraits.
- `.github/workflows/pages.yml`: automatic GitHub Pages publishing.
- `.github/workflows/check-web.yml`: UI, roster, and portrait validation.
- `server/`, `Dockerfile`, `railway.json`: dormant standalone Node.js / SQLite multiplayer backend preserved for later activation. This backend is not required or used by the current guest release.
- `app/`: legacy TanStack/Cloudflare source and original character records.

## Validation

`npm test` runs browser-simulation guest tests as well as the standalone server tests. Tests cover nickname generation and persistence, six unique picks, submission, next-day reset and browser-local history. GitHub Actions verifies public assets and performs a Docker smoke test.

## Security and fairness

The guest browser bundle ships only character names, worlds and portraits, not numeric stats. Numeric character scores remain in the public source repository's legacy dataset, so the scoring roster must be rotated or made private before deploying competitive online matching. No guest registration credentials are collected.
