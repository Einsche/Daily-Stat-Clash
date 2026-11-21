# GitHub Pages + Supabase deployment

This folder is a standalone static app; it does not connect to Higgsfield.
GitHub Pages hosts its UI, Supabase Auth and PostgreSQL handle accounts and scores.

1. Create a Supabase project you control.
2. In Supabase SQL Editor run `supabase/schema.sql` and then `supabase/seed.sql`. Optionally run `supabase/schedule.sql` to settle at Istanbul midnight; without cron the next state read reconciles the prior day.
3. Set email/password auth in Supabase, and under Authentication > URL Configuration set **Site URL** to `https://einsche.github.io/Daily-Stat-Clash/` and add it to allowed redirect URLs.
4. Edit `web/config.js` with Supabase Project URL and **publishable/anon** public key only. Do not commit a service_role key, JWT secret or DB password.
5. In GitHub repository Settings > Pages, choose **Deploy from a branch**, `main`, `/docs` if you publish this folder to docs, or configure GitHub Actions to publish the `web` directory. The delivered `web` directory has a Pages deployment workflow `.github/workflows/pages.yml` to do that once Pages is enabled.
6. Open `https://einsche.github.io/Daily-Stat-Clash/` and test registration, email confirmation (if enabled), login, six picks, submit, and next-day settlement.

Security: Characters' secret stats are in the `game_private` schema, not selectable from the browser. Nevertheless the original values remain in publicly visible Git history. Rotate scores and private seeds before competitive launch.
Status: Neither a Supabase account nor a live Pages deployment is connected here, so real sign-up is unverified.
