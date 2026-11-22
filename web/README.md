# Three-Guest Local Mode — Daily Stat Clash

Play: https://einsche.github.io/Daily-Stat-Clash/

This version runs **three independent guest profiles on one browser/device**, without signup, login, email, Supabase, or a deployed Node.js backend.

### How to use

Create Guest 1, Guest 2 and Guest 3 via the header button or the three guest slots. Each gets a unique random nickname. Click a guest slot to resume that person's separate picks.

Each guest assigns six distinct random characters to Strength, Dexterity, Battle IQ, Endurance, Hacks and IQ, and submits. When all three are submitted, select **Calculate Matchups** for immediate local testing; if left pending, the completed day is settled automatically at 00:00 Istanbul on the next visit or while the page is open.

### Scoring

All three guests play one-on-one against each other: 1–2, 1–3 and 2–3. For each of the six stats, the higher assigned character value earns +1, and an equal value earns 0 to both players. Each guest plays two matches (maximum 12 points per local day). Results include numerical values and winners for every stat. Local weekly/monthly/all-time ranks aggregate earned points; match histories are visible for the selected guest.

The separate browser profiles, picks, results and previous days are persisted locally and survive page reloads. This is not networked multiplayer; a different browser or device has separate guests and scores.

### Active character data

Exactly 160 fictional/franchise character identities across 8 universes (20 each) in `guest-roster.json`. All six numeric ratings are stored in `guest-score-map.json` so local matches can actually be calculated. Because this is GitHub Pages with no backend, those ratings are publicly accessible despite staying hidden in the normal selection interface. Original copyrighted character portraits are not included.

The optional `server/` folder is future multiplayer infrastructure, not used by this release.
