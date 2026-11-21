# Daily Stat Clash

Six characters. Six hidden stats. One daily matchup.

Source repository for the Daily Stat Clash character-stat web game.

## Independent web app

- **GitHub Pages frontend:** `web/index.html`, `web/app.js`, `web/styles.css`
- **Email registration and login:** Supabase Auth client integration in `web/app.js`
- **Account data, draws, match settlement and rankings:** `supabase/schema.sql`
- **101 original fictional characters, 12 original worlds:** `supabase/seed.sql`
- **00:00 Istanbul settlement:** `supabase/schedule.sql` (optional pg_cron)
- **Publishing automation:** `.github/workflows/pages.yml`
- **Static checks:** `.github/workflows/check-web.yml`

The frontend is not dependent on Higgsfield. A GitHub Pages URL will become available after Pages is enabled in repository settings.

### Complete production setup

1. Under [Settings → Pages](https://github.com/Einsche/Daily-Stat-Clash/settings/pages), select **GitHub Actions** as the publishing source.
2. [Run or rerun the Pages deployment](https://github.com/Einsche/Daily-Stat-Clash/actions/workflows/pages.yml).
3. Create/connect a Supabase project, then execute `supabase/schema.sql`, `supabase/seed.sql`, and (for automatic midnight settlement) `supabase/schedule.sql` in that order.
4. Under Supabase Authentication → URL Configuration, set the Site URL / redirect URL to `https://einsche.github.io/Daily-Stat-Clash/`.
5. Set the project URL and **public publishable (anon) key** in `web/config.js`; do not place service-role or secret credentials in this client file.
6. Test signup, email confirmation if required, sign-in, six unique daily assignments, submission, next-day settlement, history, and leaderboard.

More setup guidance: [web/README.md](web/README.md).

**Current delivery status:** frontend and SQL integration are committed; automated frontend/asset checks passed. GitHub Pages configuration and Supabase project provisioning are external account actions that have not been completed. This repository is not yet a verified live multiplayer service.

**Fairness:** The character values remain exposed in the public repository history and seed files. They should be replaced with a private-only scoring seed before conducting a competitive public release.

## Previous source tree

`app/` preserves the earlier React/TanStack Start and Cloudflare D1 implementation. It is not the production backend for the new GitHub Pages frontend.
