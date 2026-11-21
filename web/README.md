# Standalone public frontend — GitHub Pages

This is a static HTML/CSS/JavaScript client. It has **username + password only**, without email, Supabase, OAuth or email confirmation.

Public frontend: https://einsche.github.io/Daily-Stat-Clash/

## Backend

User accounts and daily matches require the independent Node.js + SQLite server in `server/`. GitHub Pages **cannot** run a Node.js server or securely persist passwords.

The same server also hosts the entire frontend at `/Daily-Stat-Clash/`, so a Railway deployment can be used directly without GitHub Pages.

To connect the existing GitHub Pages domain to the live Railway API:

1. Deploy the repository on Railway with its `Dockerfile` and a persistent volume mounted at `/data`.
2. Configure `PUBLIC_WEB_ORIGIN=https://einsche.github.io` on Railway.
3. Edit `web/config.js` and set `apiBase` to your actual Railway URL followed by `/Daily-Stat-Clash`, without a trailing slash.
4. Push the config change; the existing GitHub Pages workflow automatically republishes the frontend.
5. Test two browsers signing up with usernames/passwords, drawing six characters, submission and subsequent settlement.

When the site is served directly by Node.js, leave `apiBase` empty: the browser calls the same-origin backend automatically.

No provider API key is necessary in `web/config.js`; never commit passwords or session tokens. The API uses a random bearer session token and does all authentication and authorization server-side.

The UI can be opened before deployment, but sign-up and login will deliberately show that the server is unconfigured until the API has a public URL.
