# Daily Stat Clash — independent GitHub Pages deployment

Public web interface with username/password accounts only. **No email, Supabase GoTrue signup, or email confirmation required.**

## Production setup

1. Enable GitHub Pages in [repository Settings → Pages](https://github.com/Einsche/Daily-Stat-Clash/settings/pages). Under *Build and deployment → Source*, choose **GitHub Actions**.
2. Trigger/retry the [Pages workflow](https://github.com/Einsche/Daily-Stat-Clash/actions/workflows/pages.yml). It publishes `web/` plus 101 character portraits at the path required by `supabase/seed.sql`.
3. Create and connect a Supabase project. Use its SQL editor to run `supabase/schema.sql` then `supabase/seed.sql` (a fresh database; the previous email-auth schema is superseded). Optionally run `supabase/schedule.sql` for midnight reconciliation using pg_cron. The read API will also settle missed prior days on next visit.
4. Fill in `web/config.js` using Supabase Project Settings → API: your public project URL and the **publishable/anon key** only. Do not publish a service_role key, JWT signing secret, DB password or personal access token.
5. Load **https://einsche.github.io/Daily-Stat-Clash/** in two browsers. Register with *username and password*, sign out and log back in, draw six distinct characters, submit and view results after settlement.

The web page is public; accounts/sessions/selection state and score calculation live in Supabase PostgreSQL. Users never need email. Passwords are bcrypt hashed server-side, sessions are hash-stored random bearer tokens expiring after 30 days, and login attempts are throttled.

## Important limitations

- GitHub Pages hosts only the frontend. It cannot securely store passwords or run the matchmaking database.
- A connected Supabase project is required to make actual signups and login function.
- The GitHub Pages deployment previously failed at `actions/configure-pages` because the current GitHub integration cannot enable Pages at the account settings level; the repository owner must enable GitHub Actions as the source.
- The character scoring seed is currently visible in public Git history. Rotate these values privately before launch, otherwise players could cheat.
- No email means password recovery requires a separately designed administrator or recovery-code process.
- For public traffic beyond an initial limited beta, add edge-level rate limits and bot protection.

The username-only backend's PostgreSQL integration tests run in `.github/workflows/check-db.yml`.
