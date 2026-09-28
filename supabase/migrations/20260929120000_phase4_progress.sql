-- =====================================================================
-- Chosen · Phase 4: roadmaps, check-ins, XP, streaks, ranks, badges
--
-- HOW TO USE: run AFTER the Phase 3 file. Supabase → SQL Editor → New
-- query → paste this whole file → Run. Safe to run again.
--
-- Everything that gives XP, streaks, ranks or badges happens here, on the
-- server. The app can only ask ("I finished step p1s2", "here is my
-- check-in"); these functions check the rules and hand out the rewards.
--
--   • XP: step XP from the roadmap, +50 per check-in, +10 per active day
--   • Level n needs a total of 100·n^1.5 XP (everyone starts at level 0)
--   • Streak: a day counts when you finish a step, submit a check-in or
--     message the coach (in the user's own time zone)
--   • Rank from all-time profit (revenue − costs) in USD, converted with
--     the exchange_rates table
--   • 9 badges, check-in every 7 days, "Top X%" only for groups of 50+
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLE CHANGES
-- ---------------------------------------------------------------------

-- The user's time zone decides when "a day" starts for streaks.
alter table public.profiles
  add column if not exists timezone text check (char_length(timezone) <= 64);
grant update (timezone) on public.profiles to authenticated;

-- Levels now start at 0 (level 1 needs 100 XP).
do $$
begin
  if exists (select 1 from pg_constraint
             where conname = 'profiles_level_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles drop constraint profiles_level_check;
  end if;
  alter table public.profiles add constraint profiles_level_check check (level >= 0);
end;
$$;
alter table public.profiles alter column level set default 0;

-- Set when every step of the hustle's roadmap is done.
alter table public.user_hustles
  add column if not exists completed_at timestamptz;
create index if not exists user_hustles_hustle_idx on public.user_hustles (hustle_id);

-- Check-ins: amounts in USD (for ranks) and the steps finished that week.
alter table public.checkins
  add column if not exists revenue_usd numeric(14, 2),
  add column if not exists costs_usd numeric(14, 2),
  add column if not exists completed_steps text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'checkins_screenshots_max') then
    alter table public.checkins
      add constraint checkins_screenshots_max check (cardinality(screenshot_paths) <= 5);
  end if;
end;
$$;

-- One row per day the user was active (for streaks and the 30-day grid).
create table if not exists public.activity_days (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  day         date not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.activity_days enable row level security;

drop policy if exists "admins: full access" on public.activity_days;
create policy "admins: full access" on public.activity_days for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "activity_days: read own" on public.activity_days;
create policy "activity_days: read own" on public.activity_days
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 2. POLICIES: progress and check-ins are written only by the functions
--    below, so the rules (and the XP) can't be skipped.
-- ---------------------------------------------------------------------
drop policy if exists "step_progress: own" on public.step_progress;
drop policy if exists "step_progress: read own" on public.step_progress;
create policy "step_progress: read own" on public.step_progress
  for select to authenticated
  using (exists (select 1 from public.user_hustles uh
                 where uh.id = user_hustle_id and uh.user_id = (select auth.uid())));

drop policy if exists "checkins: insert own" on public.checkins;
drop policy if exists "checkins: update own" on public.checkins;

-- ---------------------------------------------------------------------
-- 3. BADGES (the 9 from the Phase 4 brief)
-- ---------------------------------------------------------------------
delete from public.badges
where id not in ('first_spin', 'chosen', 'first_step', 'streak_7', 'streak_30',
                 'first_checkin', 'first_sale', 'first_100', 'roadmap_complete');

insert into public.badges (id, name_en, name_pl, description_en, description_pl, icon, sort_order) values
  ('first_spin',       'First Spin',       'Pierwsze losowanie',    'Spun the machine for the first time',   'Pierwsze losowanie maszyną za Tobą',     'dices',          1),
  ('chosen',           'Chosen',           'Wybór podjęty',         'Committed to a hustle for 30 days',     '30-dniowe zobowiązanie podjęte',         'lock',           2),
  ('first_step',       'First Step',       'Pierwszy krok',         'Completed your first roadmap step',     'Pierwszy krok roadmapy za Tobą',         'footprints',     3),
  ('streak_7',         '7-Day Streak',     'Seria 7 dni',           'Active 7 days in a row',                '7 aktywnych dni z rzędu',                'flame',          4),
  ('streak_30',        '30-Day Streak',    'Seria 30 dni',          'Active 30 days in a row',               '30 aktywnych dni z rzędu',               'rocket',         5),
  ('first_checkin',    'First Check-in',   'Pierwsze podsumowanie', 'Submitted your first weekly check-in',  'Pierwsze cotygodniowe podsumowanie',     'calendar-check', 6),
  ('first_sale',       'First Sale',       'Pierwsza sprzedaż',     'Logged your first revenue',             'Pierwszy przychód zapisany',             'banknote',       7),
  ('first_100',        'First $100',       'Pierwsze 100 $',        'Reached $100 in total revenue',         '100 $ łącznego przychodu',               'trophy',         8),
  ('roadmap_complete', 'Roadmap Complete', 'Roadmapa ukończona',    'Finished every step of a roadmap',      'Wszystkie kroki roadmapy za Tobą',       'flag',           9)
on conflict (id) do update set
  name_en = excluded.name_en, name_pl = excluded.name_pl,
  description_en = excluded.description_en, description_pl = excluded.description_pl,
  icon = excluded.icon, sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- 4. EXCHANGE RATES (units per 1 USD, ECB rates of 2026-09-27).
--    Kept fresh by the refresh-exchange-rates Edge Function
--    (see docs/SETUP-BACKEND.md). Existing values are never overwritten.
-- ---------------------------------------------------------------------
insert into public.exchange_rates (currency, usd_rate, updated_at) values
  ('USD', 1,       now()),
  ('EUR', 0.87734, '2026-09-27'),
  ('GBP', 0.75448, '2026-09-27'),
  ('PLN', 3.843,   '2026-09-27')
on conflict (currency) do nothing;

-- =====================================================================
-- 5. RULE HELPERS (internal: the app can't call these directly)
-- =====================================================================

-- Level n needs a total of 100·n^1.5 XP.
create or replace function public.level_for_xp(p_xp integer)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_level integer := floor(power(greatest(p_xp, 0) / 100.0, 2.0 / 3.0))::integer;
begin
  -- Correct rounding at the edges so level n starts exactly at 100·n^1.5.
  while 100 * power(v_level + 1, 1.5) <= p_xp loop
    v_level := v_level + 1;
  end loop;
  while v_level > 0 and 100 * power(v_level, 1.5) > p_xp loop
    v_level := v_level - 1;
  end loop;
  return v_level;
end;
$$;

-- Rank from all-time profit in USD.
create or replace function public.rank_for_profit(p_usd numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_usd >= 10000 then 'mogul'
    when p_usd >= 1000  then 'operator'
    when p_usd >= 100   then 'earner'
    when p_usd >= 1     then 'starter'
    else 'rookie'
  end;
$$;

-- Gives a badge once. Returns true only the first time.
create or replace function public.award_badge(p_uid uuid, p_badge text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_badges (user_id, badge_id) values (p_uid, p_badge)
  on conflict (user_id, badge_id) do nothing;
  return found;
end;
$$;

-- Adds XP and keeps the level in sync.
create or replace function public.award_xp(p_uid uuid, p_amount integer)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
     set xp = xp + greatest(p_amount, 0),
         level = public.level_for_xp(xp + greatest(p_amount, 0))
   where id = p_uid;
$$;

-- Marks today as active: +10 XP and streak +1 (or restart at 1) on the
-- first activity of the day, in the user's time zone.
create or replace function public.record_activity(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile  public.profiles;
  v_today    date;
  v_streak   integer;
  v_badges   text[] := '{}';
begin
  select * into v_profile from public.profiles where id = p_uid for update;
  if not found then
    return jsonb_build_object('xp', 0, 'streak', 0, 'badges', '[]'::jsonb);
  end if;

  begin
    v_today := (now() at time zone coalesce(v_profile.timezone, 'UTC'))::date;
  exception when others then
    v_today := (now() at time zone 'UTC')::date;
  end;

  -- Already counted today (or the clock moved back after travelling).
  if v_profile.last_active_date is not null and v_today <= v_profile.last_active_date then
    return jsonb_build_object('xp', 0, 'streak', v_profile.streak_current, 'badges', '[]'::jsonb);
  end if;

  insert into public.activity_days (user_id, day) values (p_uid, v_today)
  on conflict (user_id, day) do nothing;

  v_streak := case when v_profile.last_active_date = v_today - 1
                   then v_profile.streak_current + 1 else 1 end;

  update public.profiles
     set streak_current   = v_streak,
         streak_best      = greatest(streak_best, v_streak),
         last_active_date = v_today,
         xp               = xp + 10,
         level            = public.level_for_xp(xp + 10)
   where id = p_uid;

  if v_streak >= 7 and public.award_badge(p_uid, 'streak_7') then
    v_badges := array_append(v_badges, 'streak_7');
  end if;
  if v_streak >= 30 and public.award_badge(p_uid, 'streak_30') then
    v_badges := array_append(v_badges, 'streak_30');
  end if;

  return jsonb_build_object('xp', 10, 'streak', v_streak, 'badges', to_jsonb(v_badges));
end;
$$;

-- The roadmap that applies to a committed hustle: the personalized one if
-- it exists, otherwise the newest approved base roadmap (user's language
-- first, then English).
create or replace function public.roadmap_for(p_user_hustle_id uuid, p_locale text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    uh.personalized_roadmap,
    (select r.content
       from public.roadmaps r
      where r.hustle_id = uh.hustle_id and r.status = 'approved'
      order by (r.locale = coalesce(p_locale, 'en')) desc, (r.locale = 'en') desc, r.version desc
      limit 1)
  )
  from public.user_hustles uh
  where uh.id = p_user_hustle_id;
$$;

-- All steps of a roadmap in order.
create or replace function public.roadmap_steps(p_roadmap jsonb)
returns table (step_id text, xp integer, pos integer)
language sql
immutable
set search_path = ''
as $$
  select s.step ->> 'id',
         coalesce(floor((s.step ->> 'xp')::numeric)::integer, 0),
         (row_number() over (order by p.pi, s.si))::integer
  from jsonb_array_elements(coalesce(p_roadmap -> 'phases', '[]'::jsonb)) with ordinality as p(phase, pi)
  cross join lateral jsonb_array_elements(coalesce(p.phase -> 'steps', '[]'::jsonb)) with ordinality as s(step, si);
$$;

-- What the app shows after an action (+XP, level up, badges, rank up…).
create or replace function public.reward_summary(
  p_uid                uuid,
  p_level_before       integer,
  p_rank_before        text,
  p_xp                 integer,
  p_activity           jsonb,
  p_badges             text[],
  p_roadmap_completed  boolean
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'xp_gained',         p_xp + coalesce((p_activity ->> 'xp')::integer, 0),
    'activity_xp',       coalesce((p_activity ->> 'xp')::integer, 0),
    'xp_total',          p.xp,
    'level_before',      p_level_before,
    'level_after',       p.level,
    'rank_before',       p_rank_before,
    'rank_after',        p.rank,
    'streak',            p.streak_current,
    'new_badges',        to_jsonb(p_badges) || coalesce(p_activity -> 'badges', '[]'::jsonb),
    'roadmap_completed', p_roadmap_completed
  )
  from public.profiles p
  where p.id = p_uid;
$$;

-- =====================================================================
-- 6. FUNCTIONS THE APP CALLS
-- =====================================================================

-- Mark a roadmap step as done. A step unlocks only when every step
-- before it is done. Gives the step's XP (from the roadmap on the server).
create or replace function public.complete_step(p_user_hustle_id uuid, p_step_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_profile    public.profiles;
  v_uh         public.user_hustles;
  v_roadmap    jsonb;
  v_step_xp    integer;
  v_step_pos   integer;
  v_total      integer;
  v_done       integer;
  v_xp         integer;
  v_activity   jsonb;
  v_badges     text[] := '{}';
  v_completed  boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_uh from public.user_hustles
   where id = p_user_hustle_id and user_id = v_uid
   for update;
  if not found or v_uh.status <> 'active' then
    raise exception 'hustle_not_active';
  end if;

  select * into v_profile from public.profiles where id = v_uid;

  v_roadmap := public.roadmap_for(v_uh.id, v_profile.locale);
  if v_roadmap is null then
    raise exception 'roadmap_missing';
  end if;

  select rs.xp, rs.pos into v_step_xp, v_step_pos
    from public.roadmap_steps(v_roadmap) rs
   where rs.step_id = p_step_id;
  if not found then
    raise exception 'step_not_found';
  end if;

  if exists (select 1 from public.step_progress sp
             where sp.user_hustle_id = v_uh.id and sp.step_id = p_step_id) then
    raise exception 'already_done';
  end if;

  if exists (
    select 1 from public.roadmap_steps(v_roadmap) rs
     where rs.pos < v_step_pos
       and not exists (select 1 from public.step_progress sp
                       where sp.user_hustle_id = v_uh.id and sp.step_id = rs.step_id)
  ) then
    raise exception 'step_locked';
  end if;

  insert into public.step_progress (user_hustle_id, step_id) values (v_uh.id, p_step_id);

  v_xp := least(greatest(v_step_xp, 0), 500);
  perform public.award_xp(v_uid, v_xp);
  v_activity := public.record_activity(v_uid);

  if public.award_badge(v_uid, 'first_step') then
    v_badges := array_append(v_badges, 'first_step');
  end if;

  select count(*) into v_total from public.roadmap_steps(v_roadmap);
  select count(*) into v_done
    from public.roadmap_steps(v_roadmap) rs
   where exists (select 1 from public.step_progress sp
                 where sp.user_hustle_id = v_uh.id and sp.step_id = rs.step_id);

  if v_total > 0 and v_done >= v_total and v_uh.completed_at is null then
    update public.user_hustles set completed_at = now() where id = v_uh.id;
    v_completed := true;
    if public.award_badge(v_uid, 'roadmap_complete') then
      v_badges := array_append(v_badges, 'roadmap_complete');
    end if;
  end if;

  return public.reward_summary(v_uid, v_profile.level, v_profile.rank, v_xp, v_activity, v_badges, v_completed);
end;
$$;

-- Weekly check-in. Check-in N opens on day 7·N of the hustle (day 1 is the
-- day it was chosen) and stays open until the next one opens. +50 XP,
-- steps finished since the last check-in are attached automatically.
create or replace function public.submit_checkin(
  p_user_hustle_id    uuid,
  p_feeling           integer,
  p_revenue           numeric,
  p_costs             numeric,
  p_currency          text,
  p_hours             numeric,
  p_metrics           jsonb,
  p_motivation        integer,
  p_blockers          text,
  p_next_week_plan    text,
  p_screenshot_paths  text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid            uuid := auth.uid();
  v_uh             public.user_hustles;
  v_profile        public.profiles;
  v_week           integer;
  v_rate           numeric;
  v_currency       text := upper(coalesce(p_currency, 'USD'));
  v_since          timestamptz;
  v_steps          text[];
  v_metrics        jsonb := '{}'::jsonb;
  v_key            text;
  v_val            jsonb;
  v_path           text;
  v_checkin_id     uuid;
  v_revenue_total  numeric;
  v_profit_total   numeric;
  v_new_rank       text;
  v_activity       jsonb;
  v_badges         text[] := '{}';
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_uh from public.user_hustles
   where id = p_user_hustle_id and user_id = v_uid
   for update;
  if not found or v_uh.status <> 'active' then
    raise exception 'hustle_not_active';
  end if;

  select * into v_profile from public.profiles where id = v_uid;

  v_week := (floor(extract(epoch from (now() - v_uh.started_at)) / 86400)::integer + 1) / 7;
  if v_week < 1 then
    raise exception 'checkin_not_open';
  end if;
  if exists (select 1 from public.checkins c
             where c.user_hustle_id = v_uh.id and c.week_number = v_week) then
    raise exception 'checkin_already_done';
  end if;

  if p_revenue is null or p_revenue < 0 or p_revenue > 10000000
     or p_costs is null or p_costs < 0 or p_costs > 10000000 then
    raise exception 'invalid_amount';
  end if;
  if p_hours is not null and (p_hours < 0 or p_hours > 168) then
    raise exception 'invalid_hours';
  end if;

  select er.usd_rate into v_rate from public.exchange_rates er where er.currency = v_currency;
  if v_rate is null then
    raise exception 'unsupported_currency';
  end if;

  if cardinality(coalesce(p_screenshot_paths, '{}')) > 5 then
    raise exception 'too_many_screenshots';
  end if;
  foreach v_path in array coalesce(p_screenshot_paths, '{}') loop
    if v_path not like (v_uid::text || '/%') or v_path like '%..%' or char_length(v_path) > 300 then
      raise exception 'invalid_screenshot_path';
    end if;
  end loop;

  -- Keep only simple, non-negative numbers (the hustle's weekly metrics).
  if jsonb_typeof(p_metrics) = 'object' then
    for v_key, v_val in select m.key, m.value from jsonb_each(p_metrics) m limit 12 loop
      if v_key ~ '^[a-z][a-z0-9_]{0,31}$'
         and jsonb_typeof(v_val) = 'number'
         and (v_val::text)::numeric between 0 and 1000000000 then
        v_metrics := v_metrics || jsonb_build_object(v_key, v_val);
      end if;
    end loop;
  end if;

  -- Steps finished since the previous check-in (or since the start).
  select coalesce(max(c.created_at), v_uh.started_at) into v_since
    from public.checkins c where c.user_hustle_id = v_uh.id;
  select coalesce(array_agg(sp.step_id order by sp.completed_at), '{}') into v_steps
    from public.step_progress sp
   where sp.user_hustle_id = v_uh.id and sp.completed_at >= v_since;

  insert into public.checkins (
    user_hustle_id, week_number, feeling, revenue, costs, currency, revenue_usd, costs_usd,
    hours, metrics, blockers, motivation, next_week_plan, screenshot_paths, completed_steps
  ) values (
    v_uh.id, v_week, p_feeling, round(p_revenue, 2), round(p_costs, 2), v_currency,
    round(p_revenue / v_rate, 2), round(p_costs / v_rate, 2),
    p_hours, v_metrics, nullif(left(trim(coalesce(p_blockers, '')), 4000), ''), p_motivation,
    nullif(left(trim(coalesce(p_next_week_plan, '')), 4000), ''), coalesce(p_screenshot_paths, '{}'), v_steps
  )
  returning id into v_checkin_id;

  perform public.award_xp(v_uid, 50);
  v_activity := public.record_activity(v_uid);

  if public.award_badge(v_uid, 'first_checkin') then
    v_badges := array_append(v_badges, 'first_checkin');
  end if;
  if p_revenue > 0 and public.award_badge(v_uid, 'first_sale') then
    v_badges := array_append(v_badges, 'first_sale');
  end if;

  select coalesce(sum(c.revenue_usd), 0), coalesce(sum(c.revenue_usd - c.costs_usd), 0)
    into v_revenue_total, v_profit_total
    from public.checkins c
    join public.user_hustles uh on uh.id = c.user_hustle_id
   where uh.user_id = v_uid;

  if v_revenue_total >= 100 and public.award_badge(v_uid, 'first_100') then
    v_badges := array_append(v_badges, 'first_100');
  end if;

  v_new_rank := public.rank_for_profit(v_profit_total);
  update public.profiles set rank = v_new_rank where id = v_uid and rank <> v_new_rank;

  return public.reward_summary(v_uid, v_profile.level, v_profile.rank, 50, v_activity, v_badges, false)
         || jsonb_build_object('checkin_id', v_checkin_id, 'week', v_week);
end;
$$;

-- "Top X% of users in {country} on this hustle". Computed from aggregated
-- profit only, and returned ONLY when the group has at least 50 users.
-- Nobody else's data ever leaves the database.
create or replace function public.hustle_percentile(p_user_hustle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_hustle     uuid;
  v_country    text;
  v_group      integer;
  v_mine       numeric;
  v_at_or_above integer;
begin
  if v_uid is null then
    return null;
  end if;

  select uh.hustle_id into v_hustle
    from public.user_hustles uh
   where uh.id = p_user_hustle_id and uh.user_id = v_uid;
  select p.country into v_country from public.profiles p where p.id = v_uid;
  if v_hustle is null or v_country is null then
    return null;
  end if;

  with peers as (
    select uh.user_id, coalesce(sum(c.revenue_usd - c.costs_usd), 0) as profit
      from public.user_hustles uh
      join public.profiles p on p.id = uh.user_id and p.country = v_country
      left join public.checkins c on c.user_hustle_id = uh.id
     where uh.hustle_id = v_hustle and uh.status in ('active', 'completed')
     group by uh.user_id
  )
  select count(*),
         max(profit) filter (where user_id = v_uid)
    into v_group, v_mine
    from peers;

  if v_group < 50 or v_mine is null or v_mine <= 0 then
    return null;
  end if;

  with peers as (
    select uh.user_id, coalesce(sum(c.revenue_usd - c.costs_usd), 0) as profit
      from public.user_hustles uh
      join public.profiles p on p.id = uh.user_id and p.country = v_country
      left join public.checkins c on c.user_hustle_id = uh.id
     where uh.hustle_id = v_hustle and uh.status in ('active', 'completed')
     group by uh.user_id
  )
  select count(*) into v_at_or_above from peers where profit >= v_mine;

  return jsonb_build_object(
    'top_percent', greatest(1, ceil(v_at_or_above * 100.0 / v_group))::integer,
    'country', v_country
  );
end;
$$;

-- ---------------------------------------------------------------------
-- choose_hustle v3: a hustle whose roadmap is complete no longer holds
-- the 30-day lock, and is marked 'completed' (not 'abandoned') when
-- replaced.
-- ---------------------------------------------------------------------
create or replace function public.choose_hustle(
  p_hustle_id          uuid,
  p_slot               integer default 1,
  p_use_fast_pivot     boolean default false,
  p_replace_current    boolean default false
)
returns public.user_hustles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_profile  public.profiles;
  v_current  public.user_hustles;
  v_new      public.user_hustles;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'profile_missing';
  end if;
  if v_profile.age_confirmed_at is null then
    raise exception 'age_not_confirmed';
  end if;
  if p_slot not in (1, 2) then
    raise exception 'invalid_slot';
  end if;
  if p_slot = 2 and v_profile.tier <> 'elite' then
    raise exception 'elite_required';
  end if;
  if not exists (select 1 from public.hustles h where h.id = p_hustle_id and h.is_active) then
    raise exception 'hustle_not_available';
  end if;
  if exists (select 1 from public.user_hustles uh
             where uh.user_id = v_uid and uh.status = 'active'
               and uh.slot <> p_slot and uh.hustle_id = p_hustle_id) then
    raise exception 'already_active_in_other_slot';
  end if;

  select * into v_current
  from public.user_hustles uh
  where uh.user_id = v_uid and uh.slot = p_slot and uh.status = 'active'
  for update;

  if found then
    if v_current.lock_until > now() and v_current.completed_at is null then
      if not p_use_fast_pivot then
        raise exception 'locked';
      end if;
      update public.credits
         set fast_pivot_credits = fast_pivot_credits - 1
       where user_id = v_uid and fast_pivot_credits > 0;
      if not found then
        raise exception 'no_fast_pivot_credits';
      end if;
    elsif not p_replace_current then
      raise exception 'confirm_replace_required';
    end if;
    update public.user_hustles
       set status = case when v_current.completed_at is not null then 'completed' else 'abandoned' end
     where id = v_current.id;
  end if;

  insert into public.user_hustles (user_id, hustle_id, slot)
  values (v_uid, p_hustle_id, p_slot)
  returning * into v_new;

  insert into public.spins (user_id, hustle_id, chosen) values (v_uid, p_hustle_id, true);

  return v_new;
end;
$$;

-- =====================================================================
-- 7. TRIGGERS: badges for spins, streak for coach messages
-- =====================================================================
create or replace function public.on_spin_badges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null then
    perform public.award_badge(new.user_id, 'first_spin');
    if new.chosen then
      perform public.award_badge(new.user_id, 'chosen');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists spins_badges on public.spins;
create trigger spins_badges
  after insert on public.spins
  for each row execute function public.on_spin_badges();

-- Messaging the coach counts as an active day (messages are written by
-- the coach Edge Function in a later phase).
create or replace function public.on_coach_message_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'user' then
    perform public.record_activity(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists coach_message_activity on public.coach_messages;
create trigger coach_message_activity
  after insert on public.coach_messages
  for each row execute function public.on_coach_message_activity();

-- Existing test accounts: recompute levels with the new formula.
update public.profiles set level = public.level_for_xp(xp) where level <> public.level_for_xp(xp);

-- =====================================================================
-- 8. PERMISSIONS: only these three functions can be called by the app
-- =====================================================================
revoke all on function public.level_for_xp(integer) from public, anon, authenticated;
revoke all on function public.rank_for_profit(numeric) from public, anon, authenticated;
revoke all on function public.award_badge(uuid, text) from public, anon, authenticated;
revoke all on function public.award_xp(uuid, integer) from public, anon, authenticated;
revoke all on function public.record_activity(uuid) from public, anon, authenticated;
revoke all on function public.roadmap_for(uuid, text) from public, anon, authenticated;
revoke all on function public.roadmap_steps(jsonb) from public, anon, authenticated;
revoke all on function public.reward_summary(uuid, integer, text, integer, jsonb, text[], boolean) from public, anon, authenticated;
revoke all on function public.on_spin_badges() from public, anon, authenticated;
revoke all on function public.on_coach_message_activity() from public, anon, authenticated;

revoke all on function public.complete_step(uuid, text) from public, anon;
revoke all on function public.submit_checkin(uuid, integer, numeric, numeric, text, numeric, jsonb, integer, text, text, text[]) from public, anon;
revoke all on function public.hustle_percentile(uuid) from public, anon;
revoke all on function public.choose_hustle(uuid, integer, boolean, boolean) from public, anon;
grant execute on function public.complete_step(uuid, text) to authenticated;
grant execute on function public.submit_checkin(uuid, integer, numeric, numeric, text, numeric, jsonb, integer, text, text, text[]) to authenticated;
grant execute on function public.hustle_percentile(uuid) to authenticated;
grant execute on function public.choose_hustle(uuid, integer, boolean, boolean) to authenticated;

-- The roadmaps and daily messages are seeded by the next file:
-- 20260929120100_phase4_seed.sql
