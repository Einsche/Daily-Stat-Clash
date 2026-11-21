-- Daily Stat Clash / Supabase PostgreSQL backend
-- Apply in Supabase SQL Editor, then run seed.sql and optionally schedule.sql.
-- Public clients never receive character stat values until a settled match.
create extension if not exists pgcrypto;
create schema if not exists game_private;
revoke all on schema game_private from public, anon, authenticated;

create table if not exists public.game_characters (
  id text primary key,
  name text not null,
  universe text not null,
  portrait_url text not null
);
create table if not exists game_private.character_stats (
  id text primary key references public.game_characters(id) on delete cascade,
  strength int not null check(strength between 0 and 100),
  dexterity int not null check(dexterity between 0 and 100),
  battle_iq int not null check(battle_iq between 0 and 100),
  endurance int not null check(endurance between 0 and 100),
  hacks int not null check(hacks between 0 and 100),
  iq int not null check(iq between 0 and 100)
);
create table if not exists public.game_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check(length(handle) between 3 and 25),
  created_at timestamptz not null default now()
);
create table if not exists public.game_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  current_character text references public.game_characters(id),
  submitted_at timestamptz,
  primary key(user_id,day)
);
create table if not exists public.game_picks (
  user_id uuid not null,
  day date not null,
  stat text not null check(stat in ('strength','dexterity','battle_iq','endurance','hacks','iq')),
  character_id text not null references public.game_characters(id),
  primary key(user_id,day,stat),
  unique(user_id,day,character_id),
  foreign key(user_id,day) references public.game_entries(user_id,day) on delete cascade
);
create table if not exists public.game_duels (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  player_a uuid not null references auth.users(id),
  player_b uuid not null references auth.users(id),
  points_a int not null,
  points_b int not null,
  details jsonb not null,
  created_at timestamptz not null default now(),
  unique(day,player_a),
  unique(day,player_b),
  check(player_a<>player_b)
);
create table if not exists public.game_settled_days (
  day date primary key,
  settled_at timestamptz not null default now()
);
create index if not exists game_duels_day_idx on public.game_duels(day desc);
create index if not exists game_entries_day_idx on public.game_entries(day,submitted_at);

-- Explicit RLS and grants: clients can read profiles and public character identities,
-- but all game state mutations and secret values are server-side RPC only.
alter table public.game_characters enable row level security;
alter table public.game_profiles enable row level security;
alter table public.game_entries enable row level security;
alter table public.game_picks enable row level security;
alter table public.game_duels enable row level security;
alter table public.game_settled_days enable row level security;
alter table game_private.character_stats enable row level security;

drop policy if exists game_characters_read on public.game_characters;
create policy game_characters_read on public.game_characters for select to anon,authenticated using(true);
drop policy if exists game_profiles_read on public.game_profiles;
create policy game_profiles_read on public.game_profiles for select to anon,authenticated using(true);
grant usage on schema public to anon,authenticated;
grant select on public.game_characters,public.game_profiles to anon,authenticated;
revoke all on public.game_entries,public.game_picks,public.game_duels,public.game_settled_days from anon,authenticated;
revoke all on game_private.character_stats from anon,authenticated;

create or replace function public.game_profile_signup()
returns trigger language plpgsql security definer set search_path='' as $$
declare candidate text;
begin
  candidate := regexp_replace(coalesce(new.raw_user_meta_data->>'handle',''), '[^a-zA-Z0-9_-]', '', 'g');
  if length(candidate)<3 then candidate := 'Player'; end if;
  candidate := left(candidate,18)||'-'||left(new.id::text,6);
  insert into public.game_profiles(user_id,handle) values(new.id,candidate)
  on conflict(user_id) do nothing;
  return new;
end; $$;
drop trigger if exists game_profile_signup_trigger on auth.users;
create trigger game_profile_signup_trigger after insert on auth.users
for each row execute function public.game_profile_signup();

create or replace function public.game_today()
returns date language sql stable set search_path='' as $$
select (now() at time zone 'Europe/Istanbul')::date; $$;

-- Runs once per Istanbul day, even if cron fails (get_state will reconcile yesterday).
create or replace function public.game_settle_day(target_day date)
returns void language plpgsql security definer set search_path='' as $$
declare
  pair record;
  slot text;
  char_a text;
  char_b text;
  value_a int;
  value_b int;
  total_a int;
  total_b int;
  outcomes jsonb;
begin
  if target_day>=public.game_today() then return; end if;
  perform pg_advisory_xact_lock(hashtext('daily-stat-clash:'||target_day::text));
  if exists(select 1 from public.game_settled_days where day=target_day) then return; end if;
  for pair in
    with eligible as (
      select e.user_id,
             row_number() over(order by md5(target_day::text||e.user_id::text),e.user_id) as row_no
      from public.game_entries e
      where e.day=target_day and e.submitted_at is not null
        and (select count(*) from public.game_picks p where p.user_id=e.user_id and p.day=e.day)=6
    )
    select a.user_id as a,b.user_id as b
    from eligible a join eligible b on b.row_no=a.row_no+1
    where mod(a.row_no,2)=1
  loop
    total_a:=0; total_b:=0; outcomes:='[]'::jsonb;
    foreach slot in array array['strength','dexterity','battle_iq','endurance','hacks','iq'] loop
      select p.character_id into char_a from public.game_picks p
      where p.day=target_day and p.user_id=pair.a and p.stat=slot;
      select p.character_id into char_b from public.game_picks p
      where p.day=target_day and p.user_id=pair.b and p.stat=slot;
      select (to_jsonb(s)->>slot)::int into value_a from game_private.character_stats s where s.id=char_a;
      select (to_jsonb(s)->>slot)::int into value_b from game_private.character_stats s where s.id=char_b;
      if value_a>value_b then total_a:=total_a+1; end if;
      if value_b>value_a then total_b:=total_b+1; end if;
      outcomes:=outcomes||jsonb_build_array(jsonb_build_object(
        'stat',slot,'a',value_a,'b',value_b,'a_character',char_a,'b_character',char_b));
    end loop;
    insert into public.game_duels(day,player_a,player_b,points_a,points_b,details)
    values(target_day,pair.a,pair.b,total_a,total_b,outcomes);
  end loop;
  insert into public.game_settled_days(day) values(target_day) on conflict do nothing;
end; $$;
revoke all on function public.game_settle_day(date) from public,anon,authenticated;

create or replace function public.game_state()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me uuid:=auth.uid();
  day_now date:=public.game_today();
  result jsonb;
begin
  perform public.game_settle_day(day_now-1);
  select jsonb_build_object(
    'day',day_now,'user',case when me is null then null else (
       select jsonb_build_object('id',p.user_id,'handle',p.handle)
       from public.game_profiles p where p.user_id=me) end,
    'participants',(select count(*) from public.game_entries e where e.day=day_now and e.submitted_at is not null),
    'totalCharacters',(select count(*) from public.game_characters),
    'current',(select to_jsonb(c) from public.game_entries e
       join public.game_characters c on c.id=e.current_character
       where e.user_id=me and e.day=day_now),
    'picks',coalesce((select jsonb_agg(jsonb_build_object('stat',p.stat,'character_id',p.character_id,'name',c.name,'universe',c.universe,'portrait_url',c.portrait_url))
       from public.game_picks p join public.game_characters c on c.id=p.character_id
       where p.user_id=me and p.day=day_now),'[]'::jsonb),
    'submitted',coalesce((select e.submitted_at is not null from public.game_entries e where e.user_id=me and e.day=day_now),false),
    'history',coalesce((select jsonb_agg(jsonb_build_object(
        'day',d.day,'self_points',case when d.player_a=me then d.points_a else d.points_b end,
        'opponent_points',case when d.player_a=me then d.points_b else d.points_a end,
        'opponent',case when d.player_a=me then pb.handle else pa.handle end,
        'reversed',d.player_b=me,'details',d.details) order by d.day desc)
      from (select * from public.game_duels where player_a=me or player_b=me order by day desc limit 30) d
      join public.game_profiles pa on pa.user_id=d.player_a
      join public.game_profiles pb on pb.user_id=d.player_b),'[]'::jsonb)
  ) into result;
  return result;
end; $$;

create or replace function public.game_draw()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me uuid:=auth.uid();
  today date:=public.game_today();
  entry public.game_entries%rowtype;
  picked_id text;
  card jsonb;
begin
  if me is null then raise exception 'Sign in required'; end if;
  insert into public.game_entries(user_id,day) values(me,today) on conflict do nothing;
  select * into entry from public.game_entries where user_id=me and day=today for update;
  if entry.submitted_at is not null then raise exception 'Lineup already submitted'; end if;
  if entry.current_character is not null then
    select to_jsonb(c) into card from public.game_characters c where c.id=entry.current_character;
    return card;
  end if;
  if (select count(*) from public.game_picks where user_id=me and day=today)>=6 then
    raise exception 'All six stats are assigned';
  end if;
  select c.id into picked_id from public.game_characters c
   where not exists(select 1 from public.game_picks p where p.user_id=me and p.day=today and p.character_id=c.id)
   order by random() limit 1;
  if picked_id is null then raise exception 'No characters available'; end if;
  update public.game_entries set current_character=picked_id where user_id=me and day=today;
  select to_jsonb(c) into card from public.game_characters c where c.id=picked_id;
  return card;
end; $$;

create or replace function public.game_assign(p_stat text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me uuid:=auth.uid();
  today date:=public.game_today();
  entry public.game_entries%rowtype;
begin
  if me is null then raise exception 'Sign in required'; end if;
  if p_stat not in ('strength','dexterity','battle_iq','endurance','hacks','iq') then
    raise exception 'Unknown stat'; end if;
  select * into entry from public.game_entries where user_id=me and day=today for update;
  if not found or entry.current_character is null then raise exception 'Draw a character first'; end if;
  if entry.submitted_at is not null then raise exception 'Lineup already submitted'; end if;
  insert into public.game_picks(user_id,day,stat,character_id)
    values(me,today,p_stat,entry.current_character);
  update public.game_entries set current_character=null where user_id=me and day=today;
  return public.game_state();
end; $$;

create or replace function public.game_submit()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  me uuid:=auth.uid();
  today date:=public.game_today();
  entry public.game_entries%rowtype;
begin
  if me is null then raise exception 'Sign in required'; end if;
  select * into entry from public.game_entries where user_id=me and day=today for update;
  if not found then raise exception 'No lineup started'; end if;
  if entry.submitted_at is not null then return public.game_state(); end if;
  if entry.current_character is not null or
    (select count(*) from public.game_picks where user_id=me and day=today)<>6
    then raise exception 'Assign six different characters before submitting'; end if;
  update public.game_entries set submitted_at=now() where user_id=me and day=today;
  return public.game_state();
end; $$;

create or replace function public.game_leaderboard(p_period text default 'weekly')
returns jsonb language sql stable security definer set search_path='' as $$
  with bounds as (
    select case p_period
      when 'alltime' then date '1900-01-01'
      when 'monthly' then date_trunc('month', public.game_today()::timestamp)::date
      else date_trunc('week', public.game_today()::timestamp)::date end as start_day
  ), score as (
    select d.player_a as uid,d.day,d.points_a as points from public.game_duels d,bounds b where d.day>=b.start_day
    union all
    select d.player_b,d.day,d.points_b from public.game_duels d,bounds b where d.day>=b.start_day
  )
  select coalesce(jsonb_agg(
    jsonb_build_object('handle',t.handle,'score',t.score,'matches',t.matches,'rank',t.position)
    order by t.position),'[]'::jsonb)
  from (
    select p.handle,coalesce(sum(s.points),0)::int as score,count(s.day)::int as matches,
    row_number() over(order by coalesce(sum(s.points),0) desc,count(s.day) desc,p.handle asc) as position
    from public.game_profiles p left join score s on s.uid=p.user_id
    group by p.user_id,p.handle
    order by score desc,matches desc,p.handle
    limit 100
  ) t;
$$;
revoke all on function public.game_draw() from public,anon;
revoke all on function public.game_assign(text) from public,anon;
revoke all on function public.game_submit() from public,anon;
grant execute on function public.game_draw(),public.game_assign(text),public.game_submit() to authenticated;
grant execute on function public.game_state(),public.game_leaderboard(text) to anon,authenticated;

-- Optional scheduled reconciliation is in schedule.sql; game_state also settles yesterday.
