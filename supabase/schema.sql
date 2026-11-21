-- Daily Stat Clash: public username + password accounts (NO email / OTP).
-- Fresh Supabase database installation. Execute this, then seed.sql and schedule.sql.
-- Public client may only call the approved RPC functions using the publishable anon key.
-- Do not use Supabase Auth for player accounts.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists game_private;
revoke all on schema game_private from public, anon, authenticated;

create table if not exists game_private.accounts (
  id uuid primary key default gen_random_uuid(),
  handle text not null check (handle ~ '^[A-Za-z0-9_-]{3,22}$'),
  password_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists game_account_handle_unique
  on game_private.accounts (lower(handle));

create table if not exists game_private.sessions (
  token_hash text primary key,
  user_id uuid not null references game_private.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);
create index if not exists game_sessions_expiry_idx on game_private.sessions(expires_at);
create index if not exists game_sessions_user_idx on game_private.sessions(user_id);

-- A simple server-enforced per-username login throttle.
-- Add IP rate limits / bot protection at the API edge before a large public launch.
create table if not exists game_private.login_throttle (
  handle_norm text primary key,
  failed_count integer not null default 0,
  locked_until timestamptz,
  last_attempt timestamptz not null default now()
);

create table if not exists public.game_characters (
  id text primary key,
  name text not null,
  universe text not null,
  portrait_url text not null
);
create table if not exists game_private.character_stats (
  id text primary key references public.game_characters(id) on delete cascade,
  strength integer not null check(strength between 0 and 100),
  dexterity integer not null check(dexterity between 0 and 100),
  battle_iq integer not null check(battle_iq between 0 and 100),
  endurance integer not null check(endurance between 0 and 100),
  hacks integer not null check(hacks between 0 and 100),
  iq integer not null check(iq between 0 and 100)
);

create table if not exists public.game_profiles (
  user_id uuid primary key references game_private.accounts(id) on delete cascade,
  handle text not null unique,
  created_at timestamptz not null default now()
);
create table if not exists public.game_entries (
  user_id uuid not null references public.game_profiles(user_id) on delete cascade,
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
  player_a uuid not null references public.game_profiles(user_id),
  player_b uuid not null references public.game_profiles(user_id),
  points_a integer not null check(points_a between 0 and 6),
  points_b integer not null check(points_b between 0 and 6),
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

-- Every persistent table is hidden from direct browser access.
-- All authorized operations use SECURITY DEFINER functions with restricted execution grants.
alter table public.game_characters enable row level security;
alter table public.game_profiles enable row level security;
alter table public.game_entries enable row level security;
alter table public.game_picks enable row level security;
alter table public.game_duels enable row level security;
alter table public.game_settled_days enable row level security;
alter table game_private.character_stats enable row level security;
alter table game_private.accounts enable row level security;
alter table game_private.sessions enable row level security;
alter table game_private.login_throttle enable row level security;

revoke all on public.game_characters,public.game_profiles,public.game_entries,
  public.game_picks,public.game_duels,public.game_settled_days from anon,authenticated;
revoke all on game_private.accounts,game_private.sessions,game_private.login_throttle,
  game_private.character_stats from public,anon,authenticated;
grant usage on schema public to anon,authenticated;

-- One 256-bit opaque random bearer token per session. Only SHA-256 digests are stored.
create or replace function game_private.issue_session(p_user uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare v_token text;
begin
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  delete from game_private.sessions
    where user_id=p_user and expires_at<now();
  insert into game_private.sessions(token_hash,user_id,expires_at)
    values(encode(extensions.digest(v_token,'sha256'),'hex'),p_user,now()+interval '30 days');
  return v_token;
end;
$$;

create or replace function game_private.session_user(p_token text)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_user uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null; end if;
  select s.user_id into v_user
    from game_private.sessions s
    where s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
      and s.expires_at>now();
  return v_user;
end;
$$;
revoke all on function game_private.issue_session(uuid) from public,anon,authenticated;
revoke all on function game_private.session_user(text) from public,anon,authenticated;

-- Registration: no email address, no OTP, no email confirmation.
-- Passwords are bcrypt hashed server-side, never stored or returned as plaintext.
create or replace function public.game_register(p_handle text,p_password text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_handle text:=btrim(p_handle);
declare v_user uuid;
declare v_token text;
begin
  if v_handle is null or v_handle !~ '^[A-Za-z0-9_-]{3,22}$' then
    return jsonb_build_object('error','Username must be 3–22 letters, numbers, _ or -.');
  end if;
  if p_password is null or octet_length(p_password)<10 or octet_length(p_password)>72 then
    return jsonb_build_object('error','Password must be 10–72 bytes.');
  end if;
  if exists(select 1 from game_private.accounts where lower(handle)=lower(v_handle)) then
    return jsonb_build_object('error','This username is taken.');
  end if;
  insert into game_private.accounts(handle,password_hash)
    values(v_handle,extensions.crypt(p_password,extensions.gen_salt('bf',12)))
    returning id into v_user;
  insert into public.game_profiles(user_id,handle) values(v_user,v_handle);
  v_token:=game_private.issue_session(v_user);
  return jsonb_build_object('token',v_token,'user',jsonb_build_object('id',v_user,'handle',v_handle));
exception
  when unique_violation then
    return jsonb_build_object('error','This username is taken.');
end;
$$;

-- Login: uniform error for incorrect username/password, with a bounded throttle.
-- Expected login failures return JSON instead of raising, preserving throttle writes.
create or replace function public.game_login(p_handle text,p_password text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_handle text:=lower(btrim(p_handle));
declare v_account game_private.accounts%rowtype;
declare v_guard game_private.login_throttle%rowtype;
declare v_token text;
begin
  if v_handle is null or v_handle !~ '^[a-z0-9_-]{3,22}$'
     or p_password is null or octet_length(p_password)>72 then
    return jsonb_build_object('error','Invalid username or password.');
  end if;
  insert into game_private.login_throttle(handle_norm) values(v_handle)
    on conflict(handle_norm) do nothing;
  select * into v_guard from game_private.login_throttle
    where handle_norm=v_handle for update;
  if v_guard.locked_until>now() then
    return jsonb_build_object('error','Too many attempts. Try again in 15 minutes.');
  end if;
  select * into v_account from game_private.accounts
    where lower(handle)=v_handle;
  if v_account.id is null or
    extensions.crypt(p_password,coalesce(v_account.password_hash,extensions.gen_salt('bf',12)))
      is distinct from v_account.password_hash then
    update game_private.login_throttle
      set failed_count=case when last_attempt<now()-interval '15 minutes' then 1
                            else least(failed_count+1,8) end,
          last_attempt=now(),
          locked_until=case when last_attempt>=now()-interval '15 minutes'
                                 and failed_count>=7
                           then now()+interval '15 minutes' else null end
      where handle_norm=v_handle;
    return jsonb_build_object('error','Invalid username or password.');
  end if;
  delete from game_private.login_throttle where handle_norm=v_handle;
  v_token:=game_private.issue_session(v_account.id);
  return jsonb_build_object('token',v_token,
    'user',jsonb_build_object('id',v_account.id,'handle',v_account.handle));
end;
$$;

create or replace function public.game_logout(p_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if p_token is not null and p_token ~ '^[0-9a-f]{64}$' then
    delete from game_private.sessions
      where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  end if;
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.game_today()
returns date language sql stable set search_path='' as $$
  select (now() at time zone 'Europe/Istanbul')::date;
$$;

-- Idempotent settlement; deterministic daily pairing; wins count +1 per stat.
create or replace function public.game_settle_day(target_day date)
returns void language plpgsql volatile security definer set search_path='' as $$
declare
  pair record;
  slot text;
  char_a text;
  char_b text;
  value_a integer;
  value_b integer;
  total_a integer;
  total_b integer;
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
        and (select count(*) from public.game_picks p
          where p.user_id=e.user_id and p.day=e.day)=6
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
      select (to_jsonb(s)->>slot)::integer into value_a
        from game_private.character_stats s where s.id=char_a;
      select (to_jsonb(s)->>slot)::integer into value_b
        from game_private.character_stats s where s.id=char_b;
      if value_a>value_b then total_a:=total_a+1; end if;
      if value_b>value_a then total_b:=total_b+1; end if;
      outcomes:=outcomes||jsonb_build_array(jsonb_build_object(
        'stat',slot,'a',value_a,'b',value_b,
        'a_character',char_a,'b_character',char_b));
    end loop;
    insert into public.game_duels(day,player_a,player_b,points_a,points_b,details)
      values(target_day,pair.a,pair.b,total_a,total_b,outcomes);
  end loop;
  insert into public.game_settled_days(day) values(target_day)
    on conflict do nothing;
end;
$$;

-- A guest can view leaderboard; their own state requires a valid token.
create or replace function public.game_state(p_token text default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  me uuid:=game_private.session_user(p_token);
  day_now date:=public.game_today();
  result jsonb;
begin
  perform public.game_settle_day(day_now-1);
  select jsonb_build_object(
    'day',day_now,
    'user',case when me is null then null else (
       select jsonb_build_object('id',p.user_id,'handle',p.handle)
       from public.game_profiles p where p.user_id=me) end,
    'participants',(select count(*) from public.game_entries e
       where e.day=day_now and e.submitted_at is not null),
    'totalCharacters',(select count(*) from public.game_characters),
    'current',(select to_jsonb(c) from public.game_entries e
       join public.game_characters c on c.id=e.current_character
       where e.user_id=me and e.day=day_now),
    'picks',coalesce((select jsonb_agg(jsonb_build_object(
        'stat',p.stat,'character_id',p.character_id,'name',c.name,
        'universe',c.universe,'portrait_url',c.portrait_url))
       from public.game_picks p join public.game_characters c on c.id=p.character_id
       where p.user_id=me and p.day=day_now),'[]'::jsonb),
    'submitted',coalesce((select e.submitted_at is not null
       from public.game_entries e where e.user_id=me and e.day=day_now),false),
    'history',coalesce((select jsonb_agg(jsonb_build_object(
        'day',d.day,
        'self_points',case when d.player_a=me then d.points_a else d.points_b end,
        'opponent_points',case when d.player_a=me then d.points_b else d.points_a end,
        'opponent',case when d.player_a=me then pb.handle else pa.handle end,
        'reversed',d.player_b=me,'details',d.details) order by d.day desc)
       from (select * from public.game_duels
         where player_a=me or player_b=me order by day desc limit 100) d
       join public.game_profiles pa on pa.user_id=d.player_a
       join public.game_profiles pb on pb.user_id=d.player_b),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.game_draw(p_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  me uuid:=game_private.session_user(p_token);
  today date:=public.game_today();
  entry public.game_entries%rowtype;
  picked_id text;
begin
  if me is null then raise exception 'Please sign in again'; end if;
  insert into public.game_entries(user_id,day) values(me,today) on conflict do nothing;
  select * into entry from public.game_entries
    where user_id=me and day=today for update;
  if entry.submitted_at is not null then raise exception 'Lineup already submitted'; end if;
  if entry.current_character is not null then return public.game_state(p_token); end if;
  if (select count(*) from public.game_picks where user_id=me and day=today)>=6 then
    raise exception 'All six stats are assigned'; end if;
  select c.id into picked_id from public.game_characters c
    where not exists(select 1 from public.game_picks p
      where p.user_id=me and p.day=today and p.character_id=c.id)
    order by random() limit 1;
  if picked_id is null then raise exception 'No characters available'; end if;
  update public.game_entries set current_character=picked_id where user_id=me and day=today;
  return public.game_state(p_token);
end;
$$;

create or replace function public.game_assign(p_token text,p_stat text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  me uuid:=game_private.session_user(p_token);
  today date:=public.game_today();
  entry public.game_entries%rowtype;
begin
  if me is null then raise exception 'Please sign in again'; end if;
  if p_stat not in ('strength','dexterity','battle_iq','endurance','hacks','iq') then
    raise exception 'Unknown stat'; end if;
  select * into entry from public.game_entries
    where user_id=me and day=today for update;
  if not found or entry.current_character is null then
    raise exception 'Draw a character first'; end if;
  if entry.submitted_at is not null then raise exception 'Lineup already submitted'; end if;
  insert into public.game_picks(user_id,day,stat,character_id)
    values(me,today,p_stat,entry.current_character);
  update public.game_entries set current_character=null where user_id=me and day=today;
  return public.game_state(p_token);
end;
$$;

create or replace function public.game_submit(p_token text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  me uuid:=game_private.session_user(p_token);
  today date:=public.game_today();
  entry public.game_entries%rowtype;
begin
  if me is null then raise exception 'Please sign in again'; end if;
  select * into entry from public.game_entries
    where user_id=me and day=today for update;
  if not found then raise exception 'No lineup started'; end if;
  if entry.submitted_at is not null then return public.game_state(p_token); end if;
  if entry.current_character is not null or
     (select count(*) from public.game_picks where user_id=me and day=today)<>6 then
    raise exception 'Assign six different characters before submitting'; end if;
  update public.game_entries set submitted_at=now() where user_id=me and day=today;
  return public.game_state(p_token);
end;
$$;

create or replace function public.game_leaderboard(p_period text default 'weekly')
returns jsonb language sql stable security definer set search_path='' as $$
  with bounds as (
    select case p_period
      when 'alltime' then date '1900-01-01'
      when 'monthly' then date_trunc('month',public.game_today()::timestamp)::date
      else date_trunc('week',public.game_today()::timestamp)::date end as start_day
  ), score as (
    select d.player_a as uid,d.day,d.points_a as points from public.game_duels d,bounds b
      where d.day>=b.start_day
    union all
    select d.player_b,d.day,d.points_b from public.game_duels d,bounds b
      where d.day>=b.start_day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'handle',t.handle,'score',t.score,'matches',t.matches,'rank',t.position)
      order by t.position),'[]'::jsonb)
  from (
    select p.handle,coalesce(sum(s.points),0)::integer as score,
      count(s.day)::integer as matches,
      row_number() over(order by coalesce(sum(s.points),0) desc,
        count(s.day) desc,p.handle asc) as position
    from public.game_profiles p left join score s on s.uid=p.user_id
    group by p.user_id,p.handle
    order by score desc,matches desc,p.handle
    limit 100
  ) t;
$$;

-- REVOKE first; PostgreSQL grants function execution to PUBLIC by default.
revoke all on function public.game_register(text,text),
  public.game_login(text,text),public.game_logout(text),public.game_state(text),
  public.game_draw(text),public.game_assign(text,text),public.game_submit(text),
  public.game_leaderboard(text),public.game_settle_day(date) from public,anon,authenticated;
grant execute on function public.game_register(text,text),public.game_login(text,text),
  public.game_logout(text),public.game_state(text),public.game_draw(text),
  public.game_assign(text,text),public.game_submit(text),
  public.game_leaderboard(text) to anon,authenticated;
-- game_settle_day is only for the private nightly pg_cron call or game_state fallback.
-- It is deliberately not callable directly via the public API.

-- Ask PostgREST to reload its function signatures after running this migration.
notify pgrst, 'reload schema';
