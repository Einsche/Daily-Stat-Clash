# Standalone GitHub Pages + Supabase deployment

This is an independent static frontend: it does not use Higgsfield.

**Frontend:** GitHub Pages, with `web/index.html`, `web/app.js`, `web/styles.css`.
**Backend:** Supabase Auth and PostgreSQL RPC functions for accounts, draws, submissions, daily head-to-head scoring, match history and leaderboards.

## Setup

1. Enable **GitHub Actions** as the source under [GitHub Settings → Pages](https://github.com/Einsche/Daily-Stat-Clash/settings/pages). This is mandatory: GitHub's API denied automatic Pages enablement with the current integration token.
2. [Rerun the Pages publishing workflow](https://github.com/Einsche/Daily-Stat-Clash/actions/workflows/pages.yml). The action copies all 101 portraits from `app/public/assets/portraits` into the Pages artifact, preserving their URL paths.
3. Create/connect a Supabase project. Run `supabase/schema.sql` followed by `supabase/seed.sql` in the SQL editor. Then run `supabase/schedule.sql` to enable automatic settlement at **21:00 UTC / 00:00 Europe/Istanbul**. The fallback in `game_state` settles yesterday when a user next loads the game.
4. Enable email/password under Supabase Authentication → Providers → Email. Set Supabase Authentication → URL Configuration Site URL and redirect allow-list to `https://einsche.github.io/Daily-Stat-Clash/`.
5. In `web/config.js` fill in the Supabase Project URL and the **public publishable/anon** key. These are client-facing values. Never put a service-role key, database password, JWT secret or personal access token in that file.
6. Test in a private browsing window and normal window: account registration, email confirmation (if enabled), login, a six-character round, submit, another user's round, next-day settlement and rankings.

The application URL will be **https://einsche.github.io/Daily-Stat-Clash/** once GitHub Pages has published successfully.

## Security and limitations

The SQL backend stores secret stats in `game_private`, protects them with database roles and only returns allowed metadata via RPC. Auth is handled by Supabase GoTrue. However, the numerical ratings are visible in this public repository's seed and Git history; rotate ratings to a private-only scoring source before a competitive launch.

Current status: Frontend and SQL source are ready; the site is not publicly deployed, and sign-up cannot be tested until a Supabase project and Pages site are configured.
