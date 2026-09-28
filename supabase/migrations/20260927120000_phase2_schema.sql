-- =====================================================================
-- Chosen: Side Hustle Coach · Phase 2 database
--
-- HOW TO USE: Supabase dashboard → SQL Editor → New query → paste this
-- whole file → Run. It is safe to run again (it skips what already exists
-- and refreshes the seed data).
--
-- Security model
--   • Row Level Security (RLS) is ON for every table.
--   • Users can only read/write their own rows.
--   • Admins (profiles.is_admin = true) can read/write everything.
--   • Money- and progress-related fields (tier, xp, credits, AI usage…)
--     can only be changed by the server (Edge Functions / webhooks),
--     never directly from the app.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES (one row per signed-in user, created automatically)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  display_name       text check (char_length(display_name) <= 80),
  locale             text check (locale in ('en', 'pl')),
  country            text check (country ~ '^[A-Z]{2}$'),
  currency           text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  age_confirmed_at   timestamptz,
  ai_consent_at      timestamptz,
  analytics_consent  boolean not null default false,
  quiz               jsonb,
  tier               text not null default 'free' check (tier in ('free', 'pro', 'elite')),
  coach_personality  text not null default 'balanced'
                     check (coach_personality in ('balanced', 'buddy', 'strict', 'consultant')),
  xp                 integer not null default 0 check (xp >= 0),
  level              integer not null default 1 check (level >= 1),
  rank               text not null default 'rookie'
                     check (rank in ('rookie', 'starter', 'earner', 'operator', 'mogul')),
  streak_current     integer not null default 0 check (streak_current >= 0),
  streak_best        integer not null default 0 check (streak_best >= 0),
  last_active_date   date,
  notification_time  time,
  expo_push_token    text,
  sounds_enabled     boolean not null default true,
  referral_code      text unique,
  referred_by        uuid references public.profiles (id) on delete set null,
  is_admin           boolean not null default false,
  created_at         timestamptz not null default now()
);

-- Admin check used by all policies. SECURITY DEFINER avoids RLS recursion.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

-- ---------------------------------------------------------------------
-- 2. HUSTLES (the 15 side hustles in the machine)
-- ---------------------------------------------------------------------
create table if not exists public.hustles (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  name_en             text not null,
  name_pl             text not null,
  summary_en          text not null,
  summary_pl          text not null,
  hours_per_week_min  integer not null check (hours_per_week_min > 0),
  hours_per_week_max  integer not null,
  startup_cost_min    integer not null default 0 check (startup_cost_min >= 0),  -- USD
  startup_cost_max    integer not null,                                          -- USD
  earning_range_en    text not null,
  earning_range_pl    text not null,
  difficulty          smallint not null check (difficulty between 1 and 5),
  icon                text not null default 'sparkles',
  is_active           boolean not null default true,
  check (hours_per_week_max >= hours_per_week_min),
  check (startup_cost_max >= startup_cost_min)
);

-- ---------------------------------------------------------------------
-- 3. ROADMAPS (base roadmap per hustle + language; users see approved only)
-- ---------------------------------------------------------------------
create table if not exists public.roadmaps (
  id          uuid primary key default gen_random_uuid(),
  hustle_id   uuid not null references public.hustles (id) on delete cascade,
  locale      text not null check (locale in ('en', 'pl')),
  version     integer not null default 1 check (version >= 1),
  status      text not null default 'draft' check (status in ('draft', 'approved')),
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  unique (hustle_id, locale, version)
);

-- ---------------------------------------------------------------------
-- 4. USER HUSTLES (a user's committed hustle; slot 2 = Elite only)
-- ---------------------------------------------------------------------
create table if not exists public.user_hustles (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  hustle_id             uuid not null references public.hustles (id),
  slot                  smallint not null default 1 check (slot in (1, 2)),
  started_at            timestamptz not null default now(),
  lock_until            timestamptz not null default (now() + interval '30 days'),
  status                text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  personalized_roadmap  jsonb  -- null for free users
);
create unique index if not exists user_hustles_one_active_per_slot
  on public.user_hustles (user_id, slot) where status = 'active';
create index if not exists user_hustles_user_idx on public.user_hustles (user_id);

-- ---------------------------------------------------------------------
-- 5. STEP PROGRESS (completed roadmap steps)
-- ---------------------------------------------------------------------
create table if not exists public.step_progress (
  user_hustle_id  uuid not null references public.user_hustles (id) on delete cascade,
  step_id         text not null,
  completed_at    timestamptz not null default now(),
  primary key (user_hustle_id, step_id)
);

-- ---------------------------------------------------------------------
-- 6. CHECK-INS (weekly review)
-- ---------------------------------------------------------------------
create table if not exists public.checkins (
  id                uuid primary key default gen_random_uuid(),
  user_hustle_id    uuid not null references public.user_hustles (id) on delete cascade,
  week_number       smallint not null check (week_number between 1 and 520),
  summary           text check (char_length(summary) <= 4000),
  feeling           smallint check (feeling between 1 and 5),
  revenue           numeric(12, 2) not null default 0 check (revenue >= 0),
  costs             numeric(12, 2) not null default 0 check (costs >= 0),
  currency          text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  hours             numeric(6, 2) check (hours between 0 and 168),
  metrics           jsonb not null default '{}'::jsonb,
  blockers          text check (char_length(blockers) <= 4000),
  motivation        smallint check (motivation between 1 and 10),
  next_week_plan    text check (char_length(next_week_plan) <= 4000),
  screenshot_paths  text[] not null default '{}',
  created_at        timestamptz not null default now(),
  unique (user_hustle_id, week_number)
);

-- ---------------------------------------------------------------------
-- 7. AI COACH (messages are written only by the server / Edge Function)
-- ---------------------------------------------------------------------
create table if not exists public.coach_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  user_hustle_id  uuid references public.user_hustles (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  image_paths     text[] not null default '{}',
  input_tokens    integer,
  output_tokens   integer,
  created_at      timestamptz not null default now()
);
create index if not exists coach_messages_user_idx on public.coach_messages (user_id, created_at desc);

create table if not exists public.ai_usage (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  month           date not null,  -- first day of the month
  messages_used   integer not null default 0 check (messages_used >= 0),
  bonus_messages  integer not null default 0 check (bonus_messages >= 0),
  primary key (user_id, month)
);

-- ---------------------------------------------------------------------
-- 8. CREDITS (Fast Pivot purchases)
-- ---------------------------------------------------------------------
create table if not exists public.credits (
  user_id             uuid primary key references public.profiles (id) on delete cascade,
  fast_pivot_credits  integer not null default 0 check (fast_pivot_credits >= 0)
);

-- ---------------------------------------------------------------------
-- 9. BADGES
-- ---------------------------------------------------------------------
create table if not exists public.badges (
  id              text primary key,
  name_en         text not null,
  name_pl         text not null,
  description_en  text not null,
  description_pl  text not null,
  icon            text not null default 'award',
  sort_order      integer not null default 0
);

create table if not exists public.user_badges (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  badge_id   text not null references public.badges (id) on delete cascade,
  earned_at  timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- ---------------------------------------------------------------------
-- 10. SPINS (every draw of the machine; user_id is null when signed out)
-- ---------------------------------------------------------------------
create table if not exists public.spins (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete cascade,
  hustle_id   uuid not null references public.hustles (id) on delete cascade,
  chosen      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists spins_user_idx on public.spins (user_id);

-- ---------------------------------------------------------------------
-- 11. REFERRALS
-- ---------------------------------------------------------------------
create table if not exists public.referrals (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  uuid not null references public.profiles (id) on delete cascade,
  referred_id  uuid not null unique references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'qualified', 'rewarded')),
  rewarded_at  timestamptz,
  created_at   timestamptz not null default now(),
  check (referrer_id <> referred_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_id);

-- ---------------------------------------------------------------------
-- 12. DAILY MESSAGES + EXCHANGE RATES (public reference data)
-- ---------------------------------------------------------------------
create table if not exists public.daily_messages (
  id      bigint generated always as identity primary key,
  locale  text not null check (locale in ('en', 'pl')),
  text    text not null
);

create table if not exists public.exchange_rates (
  currency    text primary key check (currency ~ '^[A-Z]{3}$'),
  usd_rate    numeric(18, 8) not null check (usd_rate > 0),  -- units of this currency per 1 USD
  updated_at  timestamptz not null default now()
);

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- New sign-up → create profile (with a unique referral code) and credits row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
  end loop;

  insert into public.profiles (id, display_name, referral_code)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80), ''),
    v_code
  )
  on conflict (id) do nothing;

  insert into public.credits (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Coach personality choice is Elite-only. If a user drops below Elite,
-- their coach falls back to "balanced" automatically.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  if new.tier <> 'elite' and new.coach_personality <> 'balanced' then
    if new.coach_personality is distinct from old.coach_personality then
      raise exception 'coach_personality_requires_elite';
    end if;
    new.coach_personality := 'balanced';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- =====================================================================
-- COLUMN PERMISSIONS
-- The app may only edit these profile fields. Everything else (tier, xp,
-- level, rank, streaks, referral code, is_admin…) is server-only.
-- =====================================================================
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (
  display_name, locale, country, currency, age_confirmed_at, ai_consent_at,
  analytics_consent, quiz, coach_personality, notification_time,
  expo_push_token, sounds_enabled
) on public.profiles to authenticated;

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles       enable row level security;
alter table public.hustles        enable row level security;
alter table public.roadmaps       enable row level security;
alter table public.user_hustles   enable row level security;
alter table public.step_progress  enable row level security;
alter table public.checkins       enable row level security;
alter table public.coach_messages enable row level security;
alter table public.ai_usage       enable row level security;
alter table public.credits        enable row level security;
alter table public.badges         enable row level security;
alter table public.user_badges    enable row level security;
alter table public.spins          enable row level security;
alter table public.referrals      enable row level security;
alter table public.daily_messages enable row level security;
alter table public.exchange_rates enable row level security;

-- Admins: full access everywhere.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'hustles', 'roadmaps', 'user_hustles', 'step_progress', 'checkins',
    'coach_messages', 'ai_usage', 'credits', 'badges', 'user_badges', 'spins',
    'referrals', 'daily_messages', 'exchange_rates'
  ] loop
    execute format('drop policy if exists "admins: full access" on public.%I', t);
    execute format(
      'create policy "admins: full access" on public.%I for all to authenticated
         using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end;
$$;

-- profiles: read and edit your own row (editable columns limited above).
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- hustles: everyone (even signed out) can read active hustles.
drop policy if exists "hustles: read active" on public.hustles;
create policy "hustles: read active" on public.hustles
  for select to anon, authenticated using (is_active);

-- roadmaps: signed-in users read approved roadmaps only.
drop policy if exists "roadmaps: read approved" on public.roadmaps;
create policy "roadmaps: read approved" on public.roadmaps
  for select to authenticated using (status = 'approved');

-- user_hustles: read your own. Creating/changing goes through choose_hustle().
drop policy if exists "user_hustles: read own" on public.user_hustles;
create policy "user_hustles: read own" on public.user_hustles
  for select to authenticated using (user_id = (select auth.uid()));

-- step_progress: manage progress on your own hustles.
drop policy if exists "step_progress: own" on public.step_progress;
create policy "step_progress: own" on public.step_progress
  for all to authenticated
  using (exists (select 1 from public.user_hustles uh
                 where uh.id = user_hustle_id and uh.user_id = (select auth.uid())))
  with check (exists (select 1 from public.user_hustles uh
                      where uh.id = user_hustle_id and uh.user_id = (select auth.uid())));

-- checkins: create, read and edit check-ins on your own hustles.
drop policy if exists "checkins: read own" on public.checkins;
create policy "checkins: read own" on public.checkins
  for select to authenticated
  using (exists (select 1 from public.user_hustles uh
                 where uh.id = user_hustle_id and uh.user_id = (select auth.uid())));

drop policy if exists "checkins: insert own" on public.checkins;
create policy "checkins: insert own" on public.checkins
  for insert to authenticated
  with check (exists (select 1 from public.user_hustles uh
                      where uh.id = user_hustle_id and uh.user_id = (select auth.uid())));

drop policy if exists "checkins: update own" on public.checkins;
create policy "checkins: update own" on public.checkins
  for update to authenticated
  using (exists (select 1 from public.user_hustles uh
                 where uh.id = user_hustle_id and uh.user_id = (select auth.uid())))
  with check (exists (select 1 from public.user_hustles uh
                      where uh.id = user_hustle_id and uh.user_id = (select auth.uid())));

-- Server-written tables: users may only read their own rows.
drop policy if exists "coach_messages: read own" on public.coach_messages;
create policy "coach_messages: read own" on public.coach_messages
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "ai_usage: read own" on public.ai_usage;
create policy "ai_usage: read own" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "credits: read own" on public.credits;
create policy "credits: read own" on public.credits
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "user_badges: read own" on public.user_badges;
create policy "user_badges: read own" on public.user_badges
  for select to authenticated using (user_id = (select auth.uid()));

-- badges, daily messages, exchange rates: public reference data.
drop policy if exists "badges: read all" on public.badges;
create policy "badges: read all" on public.badges
  for select to anon, authenticated using (true);

drop policy if exists "daily_messages: read all" on public.daily_messages;
create policy "daily_messages: read all" on public.daily_messages
  for select to anon, authenticated using (true);

drop policy if exists "exchange_rates: read all" on public.exchange_rates;
create policy "exchange_rates: read all" on public.exchange_rates
  for select to anon, authenticated using (true);

-- spins: anyone can log a (not chosen) spin; signed-in users see their own.
drop policy if exists "spins: log anonymous" on public.spins;
create policy "spins: log anonymous" on public.spins
  for insert to anon with check (user_id is null and chosen = false);

drop policy if exists "spins: log own" on public.spins;
create policy "spins: log own" on public.spins
  for insert to authenticated
  with check ((user_id is null or user_id = (select auth.uid())) and chosen = false);

drop policy if exists "spins: read own" on public.spins;
create policy "spins: read own" on public.spins
  for select to authenticated using (user_id = (select auth.uid()));

-- referrals: see referrals you made or received. Created via redeem_referral().
drop policy if exists "referrals: read own" on public.referrals;
create policy "referrals: read own" on public.referrals
  for select to authenticated
  using (referrer_id = (select auth.uid()) or referred_id = (select auth.uid()));

-- =====================================================================
-- FUNCTIONS THE APP CALLS (rules enforced on the server)
-- =====================================================================

-- Commit to a hustle for 30 days. Enforces: signed in, 18+ confirmed,
-- slot 2 only for Elite, and the 30-day lock (unless a Fast Pivot credit
-- is spent).
create or replace function public.choose_hustle(
  p_hustle_id       uuid,
  p_slot            integer default 1,
  p_use_fast_pivot  boolean default false
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
    if v_current.lock_until > now() then
      if not p_use_fast_pivot then
        raise exception 'locked';
      end if;
      update public.credits
         set fast_pivot_credits = fast_pivot_credits - 1
       where user_id = v_uid and fast_pivot_credits > 0;
      if not found then
        raise exception 'no_fast_pivot_credits';
      end if;
      update public.user_hustles set status = 'abandoned' where id = v_current.id;
    else
      update public.user_hustles set status = 'completed' where id = v_current.id;
    end if;
  end if;

  insert into public.user_hustles (user_id, hustle_id, slot)
  values (v_uid, p_hustle_id, p_slot)
  returning * into v_new;

  insert into public.spins (user_id, hustle_id, chosen) values (v_uid, p_hustle_id, true);

  return v_new;
end;
$$;

-- Apply a friend's referral code (once per account, never your own).
create or replace function public.redeem_referral(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_referrer  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select p.id into v_referrer
  from public.profiles p
  where p.referral_code = upper(trim(p_code));

  if v_referrer is null or v_referrer = v_uid then
    return false;
  end if;
  if exists (select 1 from public.profiles p where p.id = v_uid and p.referred_by is not null) then
    return false;
  end if;

  update public.profiles set referred_by = v_referrer where id = v_uid;
  insert into public.referrals (referrer_id, referred_id)
  values (v_referrer, v_uid)
  on conflict (referred_id) do nothing;
  return true;
end;
$$;

revoke all on function public.choose_hustle(uuid, integer, boolean) from public, anon;
revoke all on function public.redeem_referral(text) from public, anon;
grant execute on function public.choose_hustle(uuid, integer, boolean) to authenticated;
grant execute on function public.redeem_referral(text) to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- =====================================================================
-- STORAGE: private "checkins" bucket, one folder per user (<user id>/…)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkins', 'checkins', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

drop policy if exists "checkins bucket: read own" on storage.objects;
create policy "checkins bucket: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'checkins'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));

drop policy if exists "checkins bucket: upload own" on storage.objects;
create policy "checkins bucket: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'checkins' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "checkins bucket: update own" on storage.objects;
create policy "checkins bucket: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'checkins' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'checkins' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "checkins bucket: delete own" on storage.objects;
create policy "checkins bucket: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'checkins' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =====================================================================
-- SEED DATA
-- =====================================================================

-- The 15 hustles are seeded by the Phase 3 migration (20260928120000_phase3_machine.sql).

insert into public.badges (id, name_en, name_pl, description_en, description_pl, icon, sort_order) values
  ('first_dollar',  'First dollar',   'Pierwszy dolar',        'Logged your first revenue',       'Zapisano pierwszy przychód',       'banknote',       1),
  ('fast_launch',   'Fast launch',    'Szybki start',          'Went live in under 10 hours',     'Start w mniej niż 10 godzin',      'zap',            2),
  ('streak_7',      '7-day streak',   'Seria 7 dni',           'Showed up 7 days in a row',       '7 dni z rzędu w akcji',            'flame',          3),
  ('first_checkin', 'First check-in', 'Pierwsze podsumowanie', 'Completed a weekly check-in',     'Ukończone podsumowanie tygodnia',  'calendar-check', 4),
  ('phase_1',       'Phase 1 done',   'Faza 1 za Tobą',        'Finished your first phase',       'Ukończona pierwsza faza',          'flag',           5),
  ('first_100',     'First 100',      'Pierwsza setka',        'Reached your first 100 fans',     'Pierwsze 100 osób odbiorców',      'user-plus',      6),
  ('club_500',      '$500 club',      'Klub 500 $',            'Logged $500 in profit',           '500 $ zysku',                      'medal',          7),
  ('club_1k',       '$1k club',       'Klub 1000 $',           'Logged $1,000 in profit',         '1000 $ zysku',                     'trophy',         8),
  ('streak_14',     '14-day streak',  'Seria 14 dni',          'Two weeks without a miss',        'Dwa tygodnie bez przerwy',         'flame',          9),
  ('streak_30',     '30-day streak',  'Seria 30 dni',          'Every single day of a sprint',    'Każdy dzień sprintu',              'rocket',        10),
  ('finisher',      'Sprint finisher','Sprint ukończony',      'Completed a 30-day sprint',       'Ukończony 30-dniowy sprint',       'crown',         11),
  ('double_up',     'Double up',      'Podwójnie',             'Ran two hustles at once',         'Dwa biznesy naraz',                'layers',        12)
on conflict (id) do update set
  name_en = excluded.name_en, name_pl = excluded.name_pl,
  description_en = excluded.description_en, description_pl = excluded.description_pl,
  icon = excluded.icon, sort_order = excluded.sort_order;

insert into public.daily_messages (locale, text)
select v.locale, v.text
from (values
  ('en', 'Done beats perfect. Ship one small thing today.'),
  ('en', 'Talk to one real customer before you build anything new.'),
  ('en', 'Consistency compounds. Show up for 30 minutes, even on a bad day.'),
  ('en', 'Your first sale matters more than your logo.'),
  ('en', 'Ask for feedback early. Silence is the only real failure.'),
  ('en', 'Track your numbers. What gets measured gets better.'),
  ('en', 'Small steps, every day. That is the whole secret.'),
  ('pl', 'Zrobione jest lepsze niż idealne. Wypuść dziś jedną małą rzecz.'),
  ('pl', 'Porozmawiaj z jednym prawdziwym klientem, zanim zbudujesz coś nowego.'),
  ('pl', 'Regularność się sumuje. Poświęć 30 minut, nawet w gorszy dzień.'),
  ('pl', 'Pierwsza sprzedaż jest ważniejsza niż logo.'),
  ('pl', 'Proś o opinie wcześnie. Jedyną prawdziwą porażką jest cisza.'),
  ('pl', 'Mierz swoje wyniki. To, co mierzone, się poprawia.'),
  ('pl', 'Małe kroki, codziennie. To cały sekret.')
) as v(locale, text)
where not exists (select 1 from public.daily_messages d where d.locale = v.locale and d.text = v.text);

-- Only USD is certain (1 USD = 1 USD). Other rates will be filled in by a
-- scheduled job in a later phase.
insert into public.exchange_rates (currency, usd_rate) values ('USD', 1)
on conflict (currency) do nothing;
