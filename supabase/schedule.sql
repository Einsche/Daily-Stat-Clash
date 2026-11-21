-- Requires pg_cron enabled in your Supabase project.
-- 21:00 UTC = 00:00 Europe/Istanbul (Turkey observes UTC+3 year-round).
create extension if not exists pg_cron;
select cron.schedule('daily-stat-clash-settlement','0 21 * * *',
  $$select public.game_settle_day(public.game_today()-1)$$);
