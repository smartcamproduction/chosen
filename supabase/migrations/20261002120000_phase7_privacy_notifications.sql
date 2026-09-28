-- =====================================================================
-- Chosen · Phase 7: consent records and promotional notifications
--
-- HOW TO USE: run AFTER the Phase 6 file. Supabase → SQL Editor → New
-- query → paste this whole file → Run. Safe to run again.
--
-- Adds:
--   • a consent log: every time someone turns AI sharing, analytics or
--     promotional notifications on or off, with the server's time (GDPR
--     proof of consent; the app can't write or fake it)
--   • a separate opt-in for promotional notifications (off by default).
--     The daily coach message and check-in nudges don't depend on it.
--   • promotional campaigns sent by admins (promo-push Edge Function),
--     which only ever reach people who opted in
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILE COLUMNS
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists analytics_consent_at  timestamptz,
  add column if not exists promo_push_opt_in     boolean not null default false,
  add column if not exists promo_push_opt_in_at  timestamptz;

-- The app may switch promotional notifications on and off (the time
-- stamps are set by the database, never by the app).
grant update (promo_push_opt_in) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 2. CONSENT LOG
-- ---------------------------------------------------------------------
create table if not exists public.consent_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('ai', 'analytics', 'promo_push')),
  granted     boolean not null,
  created_at  timestamptz not null default now()
);
create index if not exists consent_log_user_idx on public.consent_log (user_id, created_at desc);
alter table public.consent_log enable row level security;

drop policy if exists "admins: full access" on public.consent_log;
create policy "admins: full access" on public.consent_log for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "consent_log: read own" on public.consent_log;
create policy "consent_log: read own" on public.consent_log
  for select to authenticated using (user_id = (select auth.uid()));

-- Records every consent change and stamps when it was given.
create or replace function public.profiles_consent_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.analytics_consent is distinct from old.analytics_consent then
    new.analytics_consent_at := case when new.analytics_consent then now() else null end;
    insert into public.consent_log (user_id, kind, granted) values (new.id, 'analytics', new.analytics_consent);
  end if;
  if new.promo_push_opt_in is distinct from old.promo_push_opt_in then
    new.promo_push_opt_in_at := case when new.promo_push_opt_in then now() else null end;
    insert into public.consent_log (user_id, kind, granted) values (new.id, 'promo_push', new.promo_push_opt_in);
  end if;
  if (new.ai_consent_at is null) is distinct from (old.ai_consent_at is null) then
    insert into public.consent_log (user_id, kind, granted) values (new.id, 'ai', new.ai_consent_at is not null);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_consent_log on public.profiles;
create trigger profiles_consent_log
  before update on public.profiles
  for each row execute function public.profiles_consent_log();

-- Consents given before this file existed.
update public.profiles
   set analytics_consent_at = coalesce(analytics_consent_at, created_at)
 where analytics_consent and analytics_consent_at is null;

-- ---------------------------------------------------------------------
-- 3. PROMOTIONAL CAMPAIGNS (admins only)
-- ---------------------------------------------------------------------
create table if not exists public.promo_campaigns (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid references public.profiles (id) on delete set null,
  audience     text not null check (audience in ('all', 'free', 'pro', 'elite')),
  title_en     text not null check (char_length(title_en) between 1 and 80),
  body_en      text not null check (char_length(body_en) between 1 and 300),
  title_pl     text not null check (char_length(title_pl) between 1 and 80),
  body_pl      text not null check (char_length(body_pl) between 1 and 300),
  url          text not null default '/today' check (url in ('/today', '/paywall', '/coach', '/machine')),
  status       text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  recipients   integer not null default 0,
  sent         integer not null default 0,
  failed       integer not null default 0,
  error        text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
alter table public.promo_campaigns enable row level security;

drop policy if exists "admins: full access" on public.promo_campaigns;
create policy "admins: full access" on public.promo_campaigns for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Who may receive a promotional notification: opted in, has a push token,
-- finished the age check. Paged so large lists are sent in parts.
create or replace function public.promo_push_targets(
  p_audience  text,
  p_limit     integer default 1000,
  p_offset    integer default 0
)
returns table (user_id uuid, expo_push_token text, locale text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.expo_push_token, coalesce(p.locale, 'en')
    from public.profiles p
   where p.promo_push_opt_in
     and p.expo_push_token is not null
     and p.age_confirmed_at is not null
     and (p_audience = 'all' or p.tier = p_audience)
   order by p.id
   limit greatest(1, least(p_limit, 1000))
  offset greatest(p_offset, 0);
$$;

-- ---------------------------------------------------------------------
-- 4. PERMISSIONS
-- ---------------------------------------------------------------------
revoke all on function public.profiles_consent_log() from public, anon, authenticated;
revoke all on function public.promo_push_targets(text, integer, integer) from public, anon, authenticated;
grant execute on function public.promo_push_targets(text, integer, integer) to service_role;
