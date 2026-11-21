-- Daily Stat Clash / Supabase Postgres
-- Apply once to a Supabase project using its SQL editor or management connector.
-- Important: not deployed until a Supabase project is connected.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check(length(handle) between 3 and 24),
  created_at timestamptz not null default now()
);

create table if not exists public.characters (
  id text primary key,
  name text not null,
  universe text not null,
  portrait_url text not null,
  strength smallint not null check (strength between 0 and 100),
  dexterity smallint not null check (dexterity between 0 and 100),
  battle_iq smallint not null check (battle_iq between 0 and 100),
  endurance smallint not null check (endurance between 0 and 100),
  hacks smallint not null check (hacks between 0 and 100),
  iq smallint not null check (iq between 0 and 100)
);

create table if not exists public.daily_runs (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  day date not null,
  current_character_id text references public.characters(id),
  submitted_at timestamptz,
  primary key (user_id, day)
);

create table if not exists public.daily_picks (
  user_id uuid not null,
  day date not null,
  stat text not null check(stat in ('strength','dexterity','battle_iq','endurance','hacks','iq')),
  character_id text not null references public.characters(id),
  picked_at timestamptz not null default now(),
  primary key (user_id, day, stat),
  unique(user_id, day, character_id),
  foreign key(user_id, day) references public.daily_runs(user_id, day) on delete cascade
);

create table if not exists public.matchups (
  id bigint generated always as identity primary key,
  day date not null,
  user_a uuid not null references public.profiles(user_id) on delete cascade,
  user_b uuid not null references public.profiles(user_id) on delete cascade,
  a_score smallint not null check(a_score between 0 and 6),
  b_score smallint not null check(b_score between 0 and 6),
  breakdown jsonb not null,
  created_at timestamptz not null default now(),
  constraint distinct_opponents check (user_a <> user_b),
  constraint unique_user_a_per_day unique(day, user_a),
  constraint unique_user_b_per_day unique(day, user_b)
);
create index if not exists idx_matchups_a on public.matchups(user_a,day desc);
create index if not exists idx_matchups_b on public.matchups(user_b,day desc);

create table if not exists public.settled_days (
  day date primary key,
  settled_at timestamptz not null default now()
);

-- Do not allow browser clients to read hidden stats, change picks or fabricate scores.
alter table public.profiles enable row level security;
alter table public.characters enable row level security;
alter table public.daily_runs enable row level security;
alter table public.daily_picks enable row level security;
alter table public.matchups enable row level security;
alter table public.settled_days enable row level security;
revoke all on public.profiles, public.characters, public.daily_runs, public.daily_picks, public.matchups, public.settled_days from anon, authenticated;

-- Profiles are created by Supabase Auth, never directly by the browser.
create or replace function public.create_player_profile()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_handle text;
begin
  v_handle := regexp_replace(coalesce(new.raw_user_meta_data->>'handle','player'), '[^A-Za-z0-9_]', '', 'g');
  if length(v_handle) < 3 then v_handle := 'player'; end if;
  v_handle := left(v_handle, 16) || '_' || left(replace(new.id::text,'-',''),5);
  insert into public.profiles(user_id, handle) values (new.id, v_handle)
    on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_dsc on auth.users;
create trigger on_auth_user_created_dsc after insert on auth.users
for each row execute procedure public.create_player_profile();

-- Public leaderboard: metadata and earned points only, no secret character values.
create or replace function public.leaderboard(p_period text default 'weekly')
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp
as $$
declare v_today date := (now() at time zone 'Europe/Istanbul')::date;
declare v_from date;
declare v_out jsonb;
begin
  if p_period not in ('weekly','monthly','alltime') then
    raise exception 'Invalid leaderboard period';
  end if;
  v_from := case p_period
    when 'weekly' then v_today - (extract(isodow from v_today)::int - 1)
    when 'monthly' then date_trunc('month',v_today::timestamp)::date
    else date '2000-01-01'
  end;
  select coalesce(jsonb_agg(jsonb_build_object('handle',q.handle,'score',q.score,'matches',q.matches)
     order by q.score desc,q.matches desc,q.handle asc),'[]'::jsonb)
  into v_out
  from (
    select p.handle,coalesce(sum(pts.score),0)::integer as score,
      count(pts.day)::integer as matches
    from public.profiles p
    left join (
       select user_a as user_id,day,a_score as score from public.matchups
       union all select user_b as user_id,day,b_score as score from public.matchups
    ) pts on pts.user_id=p.user_id and pts.day>=v_from
    group by p.user_id,p.handle
    order by score desc,matches desc,p.handle asc
    limit 100
  ) q;
  return v_out;
end;
$$;

-- Creates one draw for the current account, protected by a row lock.
create or replace function public.game_state()
returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp
as $$
declare v_user uuid := auth.uid();
declare v_day date := (now() at time zone 'Europe/Istanbul')::date;
declare v_run public.daily_runs%rowtype;
declare v_current text;
declare v_pick_count integer;
declare v_state jsonb;
begin
  if v_user is null then raise exception 'Sign in to play'; end if;
  -- Backfill profile on older existing accounts if the trigger was added later.
  insert into public.profiles(user_id,handle) values
    (v_user, 'player_' || left(replace(v_user::text,'-',''),8))
  on conflict(user_id) do nothing;
  insert into public.daily_runs(user_id,day) values(v_user,v_day)
    on conflict(user_id,day) do nothing;
  select * into v_run from public.daily_runs
   where user_id=v_user and day=v_day for update;
  select count(*) into v_pick_count from public.daily_picks
   where user_id=v_user and day=v_day;
  if v_run.submitted_at is null and v_run.current_character_id is null and v_pick_count<6 then
    select c.id into v_current from public.characters c where not exists(
      select 1 from public.daily_picks dp
       where dp.user_id=v_user and dp.day=v_day and dp.character_id=c.id
    ) order by random() limit 1;
    if v_current is not null then
      update public.daily_runs set current_character_id=v_current
       where user_id=v_user and day=v_day;
      v_run.current_character_id:=v_current;
    end if;
  end if;
  select jsonb_build_object(
    'day',v_day,
    'user',(select jsonb_build_object('id',user_id,'handle',handle) from public.profiles where user_id=v_user),
    'participants',(select count(*) from public.profiles),
    'totalCharacters',(select count(*) from public.characters),
    'submitted',v_run.submitted_at is not null,
    'current',(select jsonb_build_object('id',id,'name',name,'universe',universe,'portrait_url',portrait_url)
       from public.characters where id=v_run.current_character_id),
    'picks',coalesce((select jsonb_agg(jsonb_build_object(
        'character_id',dp.character_id,'stat',dp.stat,'name',c.name,'universe',c.universe,'portrait_url',c.portrait_url
       ) order by dp.picked_at)
       from public.daily_picks dp join public.characters c on c.id=dp.character_id
       where dp.user_id=v_user and dp.day=v_day),'[]'::jsonb),
    'leaderboards',jsonb_build_object('weekly',public.leaderboard('weekly'),
      'monthly',public.leaderboard('monthly'),'alltime',public.leaderboard('alltime')),
    'history',coalesce((
      select jsonb_agg(jsonb_build_object(
        'day',m.day,'opponent_handle',opp.handle,
        'your_score',case when m.user_a=v_user then m.a_score else m.b_score end,
        'opponent_score',case when m.user_a=v_user then m.b_score else m.a_score end,
        'breakdown',m.breakdown
      ) order by m.day desc)
      from public.matchups m
      join public.profiles opp on opp.user_id=case when m.user_a=v_user then m.user_b else m.user_a end
      where m.user_a=v_user or m.user_b=v_user
    ),'[]'::jsonb)
   ) into v_state;
  return v_state;
end;
$$;

create or replace function public.assign_stat(p_stat text)
returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp
as $$
declare v_user uuid := auth.uid();
declare v_day date := (now() at time zone 'Europe/Istanbul')::date;
declare v_run public.daily_runs%rowtype;
declare v_count integer;
begin
  if v_user is null then raise exception 'Sign in to play'; end if;
  if p_stat not in ('strength','dexterity','battle_iq','endurance','hacks','iq') then
    raise exception 'Invalid stat';
  end if;
  perform public.game_state();
  select * into v_run from public.daily_runs
    where user_id=v_user and day=v_day for update;
  if v_run.submitted_at is not null then raise exception 'Today''s lineup is locked'; end if;
  if v_run.current_character_id is null then raise exception 'No character available'; end if;
  select count(*) into v_count from public.daily_picks
    where user_id=v_user and day=v_day;
  if v_count>=6 then raise exception 'All six picks are already assigned'; end if;
  if exists(select 1 from public.daily_picks where user_id=v_user and day=v_day and stat=p_stat) then
    raise exception 'You already assigned this stat';
  end if;
  insert into public.daily_picks(user_id,day,stat,character_id)
    values(v_user,v_day,p_stat,v_run.current_character_id);
  update public.daily_runs set current_character_id=null
    where user_id=v_user and day=v_day;
  return public.game_state();
end;
$$;

create or replace function public.submit_lineup()
returns jsonb language plpgsql volatile security definer set search_path=public,pg_temp
as $$
declare v_user uuid := auth.uid();
declare v_day date := (now() at time zone 'Europe/Istanbul')::date;
declare v_count integer;
declare v_submitted timestamptz;
begin
  if v_user is null then raise exception 'Sign in to play'; end if;
  perform public.game_state();
  select submitted_at into v_submitted from public.daily_runs
    where user_id=v_user and day=v_day for update;
  if v_submitted is not null then raise exception 'Today''s lineup was already submitted'; end if;
  select count(*) into v_count from public.daily_picks where user_id=v_user and day=v_day;
  if v_count<>6 then raise exception 'You must choose all six stats before submitting'; end if;
  update public.daily_runs set submitted_at=now(),current_character_id=null
    where user_id=v_user and day=v_day;
  return public.game_state();
end;
$$;

-- Idempotent midnight reconciliation. Only submitted six-pick lineups play.
-- Consecutive pairs are selected by a fixed per-day hash of UUIDs; an odd
-- participant gets a bye (no points) and may play on future days.
create or replace function public.settle_day(p_day date)
returns integer language plpgsql volatile security definer set search_path=public,pg_temp
as $$
declare v_user uuid;
declare v_pending uuid := null;
declare v_a integer;
declare v_b integer;
declare v_a_score integer;
declare v_b_score integer;
declare v_stat text;
declare v_breakdown jsonb;
declare v_matches integer := 0;
declare v_rows integer;
begin
  if p_day >= (now() at time zone 'Europe/Istanbul')::date then
    raise exception 'Only completed days can be settled';
  end if;
  insert into public.settled_days(day) values(p_day) on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows=0 then return 0; end if;
  for v_user in
    select r.user_id from public.daily_runs r
    where r.day=p_day and r.submitted_at is not null and
      (select count(*) from public.daily_picks dp where dp.user_id=r.user_id and dp.day=p_day)=6
    order by md5(r.user_id::text || p_day::text),r.user_id
  loop
    if v_pending is null then
      v_pending:=v_user;
    else
      v_a_score:=0; v_b_score:=0; v_breakdown:='[]'::jsonb;
      foreach v_stat in array array['strength','dexterity','battle_iq','endurance','hacks','iq'] loop
        select case v_stat when 'strength' then c.strength when 'dexterity' then c.dexterity
           when 'battle_iq' then c.battle_iq when 'endurance' then c.endurance
           when 'hacks' then c.hacks else c.iq end
          into v_a
        from public.daily_picks p join public.characters c on c.id=p.character_id
        where p.user_id=v_pending and p.day=p_day and p.stat=v_stat;
        select case v_stat when 'strength' then c.strength when 'dexterity' then c.dexterity
           when 'battle_iq' then c.battle_iq when 'endurance' then c.endurance
           when 'hacks' then c.hacks else c.iq end
          into v_b
        from public.daily_picks p join public.characters c on c.id=p.character_id
        where p.user_id=v_user and p.day=p_day and p.stat=v_stat;
        if v_a>v_b then v_a_score:=v_a_score+1; end if;
        if v_b>v_a then v_b_score:=v_b_score+1; end if;
        v_breakdown:=v_breakdown || jsonb_build_array(jsonb_build_object(
          'stat',v_stat,'a',v_a,'b',v_b,'winner',
          case when v_a>v_b then 'a' when v_b>v_a then 'b' else 'tie' end
        ));
      end loop;
      insert into public.matchups(day,user_a,user_b,a_score,b_score,breakdown)
        values(p_day,v_pending,v_user,v_a_score,v_b_score,v_breakdown);
      v_matches:=v_matches+1;
      v_pending:=null;
    end if;
  end loop;
  return v_matches;
end;
$$;

create or replace function public.settle_missed()
returns integer language plpgsql volatile security definer set search_path=public,pg_temp
as $$
declare v_day date;
declare v_result integer := 0;
declare v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  for v_day in select generate_series(v_today-30,v_today-1,interval '1 day')::date loop
    v_result:=v_result+public.settle_day(v_day);
  end loop;
  return v_result;
end;
$$;

-- Supabase public and authenticated API consumers get functions, never tables.
revoke all on function public.game_state() from public,anon,authenticated;
revoke all on function public.assign_stat(text) from public,anon,authenticated;
revoke all on function public.submit_lineup() from public,anon,authenticated;
revoke all on function public.leaderboard(text) from public,anon,authenticated;
revoke all on function public.settle_day(date) from public,anon,authenticated;
revoke all on function public.settle_missed() from public,anon,authenticated;
grant execute on function public.game_state(),public.assign_stat(text),public.submit_lineup() to authenticated;
grant execute on function public.leaderboard(text) to anon,authenticated;
