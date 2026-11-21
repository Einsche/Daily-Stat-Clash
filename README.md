# Daily Stat Clash

Six characters. Six hidden stats. One daily matchup. Public multiplayer browser game.

## Architecture

- **Public frontend:** `web/` — mobile/desktop interface hosted on GitHub Pages
- **Account registration/login:** USERNAME + PASSWORD ONLY; no email, no confirmation link
- **Database/API:** `supabase/schema.sql` — PostgreSQL with bcrypt password hashes, expiring opaque sessions and protected RPC operations
- **Game:** six distinct character draws, hidden stats, submission lock, Istanbul midnight matching, history, weekly/monthly/all-time rankings
- **Content:** `supabase/seed.sql` contains 101 original fantasy characters, across 12 original worlds
- **Midnight scheduler:** `supabase/schedule.sql` (requires pg_cron)
- **Source:** `app/` preserves the earlier Higgsfield/Cloudflare Worker implementation, which is *not* the backend used by the independent version

## Activate the public site

1. In [GitHub → Settings → Pages](https://github.com/Einsche/Daily-Stat-Clash/settings/pages) select **GitHub Actions** as the publishing source. The existing [Pages workflow](https://github.com/Einsche/Daily-Stat-Clash/actions/workflows/pages.yml) builds the public site and copies all 101 portraits. GitHub denied automatic enablement via its Actions installation, so an account owner must make this setting.
2. Create/connect a Supabase project. No Supabase Auth email configuration is required. Execute `supabase/schema.sql`, then `supabase/seed.sql`, and optionally `supabase/schedule.sql` in the SQL editor.
3. Populate `web/config.js` with that project's URL and *publishable/anon* key (public client credentials). NEVER publish a database password, service_role key, JWT signing secret or GitHub PAT.
4. Open `https://einsche.github.io/Daily-Stat-Clash/` once GitHub Pages is deployed, and test username-only signup and login, picks, submit and settlements using two accounts.

See [web/README.md](web/README.md) for the deployment checklist.

### Account behavior

Registration requires a unique username (3–22 ASCII letters, numbers, underscore or hyphen) and a password (10–72 UTF-8 bytes). Passwords use bcrypt cost 12 in PostgreSQL. The browser stores only a random 256-bit session token; the database stores its hash. Sessions expire after 30 days and are revoked at sign-out. Repeated failed password attempts trigger a temporary lockout. **No email means there is no self-service password recovery.**

### Deployment status

The username-only UI and backend SQL have been committed, and the independent frontend's automated syntax and content checks pass. **The service is not live until GitHub Pages is enabled and a Supabase project is connected and seeded.**

### Pre-launch security

PostgreSQL table access is not public; the browser receives only allowed results from restricted RPC functions. However, the current character ratings are in this public repository's seed and Git history, so players can discover them. Replace with a PRIVATE seed before any competitive public launch. Add request/IP rate limiting, abuse monitoring and bot protection for a larger audience.
