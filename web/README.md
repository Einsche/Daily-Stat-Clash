# Current public Daily Stat Clash — crossover guest mode

URL: https://einsche.github.io/Daily-Stat-Clash/

The guest character roster has **160 characters from exactly eight universes**: Hunter x Hunter, Naruto, DC, Marvel, The Witcher, Jujutsu Kaisen, Attack on Titan and Bleach, 20 per universe.

The old 101 original characters are no longer part of the active draw pool. `guest-roster.json` contains only character IDs, names and universe names. All six scores are kept out of the browser bundle (though the source repository's full dataset is public).

Press **PLAY AS GUEST** to get a random nickname and a first character. Each assigned character automatically draws the next one, until six distinct picks are assigned. Submit locks the current browser's daily lineup. No sign-in or account provider is needed.

The browser uses `localStorage` for nickname, current card, picks and prior submissions. The eight-franchise revision clears prior guest lineups and submission history on first load, since those records referenced the retired original characters. Names are retained.

This is a local-only demo. Scored multiplayer matches, cross-device accounts and public leaderboards are not yet active.

Official character likenesses/portraits are not included. The UI uses initials with universe-specific gradient colors until properly licensed or user-provided artwork is available. The earlier original-character portrait assets are no longer packaged into GitHub Pages.

The Node.js/SQLite server in `server/` is optional future multiplayer infrastructure and is not currently deployed.
