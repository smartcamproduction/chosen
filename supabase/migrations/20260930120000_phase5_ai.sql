-- =====================================================================
-- Chosen · Phase 5: AI coach, AI roadmaps, daily motivation
--
-- HOW TO USE: run AFTER the Phase 4 files. Supabase → SQL Editor → New
-- query → paste this whole file → Run. Safe to run again.
--
-- The AI itself runs in Edge Functions (supabase/functions/*) that call
-- the Claude API with the ANTHROPIC_API_KEY secret. This file adds the
-- tables and rules they rely on:
--   • monthly coach message limits (Pro 150, Elite 400, + bonus)
--   • token usage per month
--   • check-in feedback and nudges as coach messages
--   • personalized roadmap status per hustle
--   • one daily push per user (motivation or nudge)
--   • background jobs for AI-generated draft roadmaps (admins)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLE CHANGES
-- ---------------------------------------------------------------------

-- Monthly AI usage: tokens next to the message counter.
alter table public.ai_usage
  add column if not exists input_tokens       bigint not null default 0,
  add column if not exists output_tokens      bigint not null default 0,
  add column if not exists cache_read_tokens  bigint not null default 0,
  add column if not exists cache_write_tokens bigint not null default 0,
  add column if not exists ai_calls           integer not null default 0;

-- Coach messages: what kind of message it is and what it's linked to.
--   chat             – normal conversation (counts towards the monthly limit)
--   checkin          – marker "week N check-in submitted" (role 'system')
--   checkin_feedback – the coach's analysis of a check-in
--   nudge            – "you haven't checked in for a while" from the coach
alter table public.coach_messages
  add column if not exists kind text not null default 'chat',
  add column if not exists checkin_id uuid references public.checkins (id) on delete cascade,
  add column if not exists model text,
  add column if not exists cache_read_tokens integer,
  add column if not exists cache_write_tokens integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'coach_messages_kind_check') then
    alter table public.coach_messages
      add constraint coach_messages_kind_check
      check (kind in ('chat', 'checkin', 'checkin_feedback', 'nudge'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coach_messages_content_length') then
    alter table public.coach_messages
      add constraint coach_messages_content_length check (char_length(content) <= 20000);
  end if;
end;
$$;

-- One check-in marker and one feedback per check-in.
create unique index if not exists coach_messages_checkin_once
  on public.coach_messages (checkin_id, kind) where checkin_id is not null;

-- Personalized roadmap status (Pro / Elite).
alter table public.user_hustles
  add column if not exists personalization_status text,
  add column if not exists personalization_error text,
  add column if not exists personalization_started_at timestamptz,
  add column if not exists personalized_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_hustles_personalization_status_check') then
    alter table public.user_hustles
      add constraint user_hustles_personalization_status_check
      check (personalization_status in ('pending', 'done', 'failed'));
  end if;
end;
$$;

-- One daily push per user and local day.
create table if not exists public.daily_pushes (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  local_day   date not null,
  kind        text not null check (kind in ('motivation', 'nudge')),
  text        text not null check (char_length(text) <= 500),
  send_at     timestamptz,            -- null = shown in the app only (no push)
  status      text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped', 'in_app')),
  sent_at     timestamptz,
  error       text,
  created_at  timestamptz not null default now(),
  unique (user_id, local_day)
);
create index if not exists daily_pushes_due_idx on public.daily_pushes (status, send_at);
alter table public.daily_pushes enable row level security;

drop policy if exists "admins: full access" on public.daily_pushes;
create policy "admins: full access" on public.daily_pushes for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "daily_pushes: read own" on public.daily_pushes;
create policy "daily_pushes: read own" on public.daily_pushes
  for select to authenticated using (user_id = (select auth.uid()));

-- Background jobs (AI-generated draft roadmaps). Admins only.
create table if not exists public.ai_jobs (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('generate_roadmap')),
  hustle_id     uuid references public.hustles (id) on delete cascade,
  locale        text check (locale in ('en', 'pl')),
  status        text not null default 'running' check (status in ('running', 'done', 'failed')),
  error         text,
  roadmap_id    uuid references public.roadmaps (id) on delete set null,
  requested_by  uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
alter table public.ai_jobs enable row level security;

drop policy if exists "admins: full access" on public.ai_jobs;
create policy "admins: full access" on public.ai_jobs for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- =====================================================================
-- 2. FUNCTIONS FOR THE EDGE FUNCTIONS (service role only)
-- =====================================================================

-- Monthly coach messages included in each plan.
create or replace function public.coach_message_limit(p_tier text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_tier when 'elite' then 400 when 'pro' then 150 else 0 end;
$$;

-- Takes one message from this month's allowance (plan limit + bonus).
-- Returns { ok, used, limit, bonus }. Safe when two messages arrive at once.
create or replace function public.consume_coach_message(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month  date := date_trunc('month', now() at time zone 'UTC')::date;
  v_tier   text;
  v_limit  integer;
  v_row    public.ai_usage;
begin
  select p.tier into v_tier from public.profiles p where p.id = p_uid;
  v_limit := public.coach_message_limit(coalesce(v_tier, 'free'));

  insert into public.ai_usage (user_id, month) values (p_uid, v_month)
  on conflict (user_id, month) do nothing;

  select * into v_row from public.ai_usage where user_id = p_uid and month = v_month for update;

  if v_row.messages_used >= v_limit + v_row.bonus_messages then
    return jsonb_build_object('ok', false, 'used', v_row.messages_used, 'limit', v_limit, 'bonus', v_row.bonus_messages);
  end if;

  update public.ai_usage set messages_used = messages_used + 1
   where user_id = p_uid and month = v_month;

  return jsonb_build_object('ok', true, 'used', v_row.messages_used + 1, 'limit', v_limit, 'bonus', v_row.bonus_messages);
end;
$$;

-- Gives a message back when the AI call failed.
create or replace function public.refund_coach_message(p_uid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage
     set messages_used = greatest(0, messages_used - 1)
   where user_id = p_uid and month = date_trunc('month', now() at time zone 'UTC')::date;
$$;

-- Adds token usage of one AI call to this month's totals.
create or replace function public.record_ai_usage(
  p_uid          uuid,
  p_input        integer,
  p_output       integer,
  p_cache_read   integer,
  p_cache_write  integer
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_usage (user_id, month, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, ai_calls)
  values (p_uid, date_trunc('month', now() at time zone 'UTC')::date,
          greatest(p_input, 0), greatest(p_output, 0), greatest(p_cache_read, 0), greatest(p_cache_write, 0), 1)
  on conflict (user_id, month) do update set
    input_tokens       = public.ai_usage.input_tokens + excluded.input_tokens,
    output_tokens      = public.ai_usage.output_tokens + excluded.output_tokens,
    cache_read_tokens  = public.ai_usage.cache_read_tokens + excluded.cache_read_tokens,
    cache_write_tokens = public.ai_usage.cache_write_tokens + excluded.cache_write_tokens,
    ai_calls           = public.ai_usage.ai_calls + 1;
$$;

-- "Get 100 more messages" (called by the purchase webhook in Phase 6).
create or replace function public.add_bonus_messages(p_uid uuid, p_amount integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_usage (user_id, month, bonus_messages)
  values (p_uid, date_trunc('month', now() at time zone 'UTC')::date, greatest(p_amount, 0))
  on conflict (user_id, month) do update set
    bonus_messages = public.ai_usage.bonus_messages + excluded.bonus_messages;
$$;

-- A time zone name Postgres understands, or UTC.
create or replace function public.safe_timezone(p_tz text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_tz is null then
    return 'UTC';
  end if;
  perform now() at time zone p_tz;
  return p_tz;
exception when others then
  return 'UTC';
end;
$$;

-- Users who need today's motivation line (or nudge) prepared.
--   • push users: next notification_time in their own time zone
--   • Pro / Elite users active in the last 14 days get a line for the app
--     even without push
drop function if exists public.motivation_candidates(integer);
create or replace function public.motivation_candidates(p_limit integer default 50)
returns table (
  user_id               uuid,
  local_day             date,
  send_at               timestamptz,
  tier                  text,
  locale                text,
  display_name          text,
  quiz                  jsonb,
  coach_personality     text,
  ai_consent            boolean,
  streak                integer,
  user_hustle_id        uuid,
  hustle_id             uuid,
  started_at            timestamptz,
  days_since_checkin    integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select p.*,
           public.safe_timezone(p.timezone) as tz,
           (p.expo_push_token is not null and p.notification_time is not null) as wants_push
      from public.profiles p
     where p.age_confirmed_at is not null
       and ((p.expo_push_token is not null and p.notification_time is not null)
            or (p.tier in ('pro', 'elite') and p.last_active_date >= (now() at time zone 'UTC')::date - 14))
  ),
  timed as (
    select b.*,
           (now() at time zone b.tz) as local_now,
           case
             when not b.wants_push then null
             when (now() at time zone b.tz)::time < b.notification_time
               then (((now() at time zone b.tz)::date + b.notification_time) at time zone b.tz)
             else ((((now() at time zone b.tz)::date + 1) + b.notification_time) at time zone b.tz)
           end as next_send
      from base b
  )
  select t.id,
         coalesce((t.next_send at time zone t.tz)::date, (t.local_now)::date),
         t.next_send,
         t.tier,
         coalesce(t.locale, 'en'),
         t.display_name,
         t.quiz,
         t.coach_personality,
         t.ai_consent_at is not null,
         case when t.last_active_date >= (t.local_now)::date - 1 then t.streak_current else 0 end,
         uh.id,
         uh.hustle_id,
         uh.started_at,
         floor(extract(epoch from (now() - coalesce(
           (select max(c.created_at) from public.checkins c where c.user_hustle_id = uh.id),
           uh.started_at))) / 86400)::integer
    from timed t
    left join lateral (
      select * from public.user_hustles u
       where u.user_id = t.id and u.status = 'active'
       order by u.slot
       limit 1
    ) uh on true
   where not exists (
     select 1 from public.daily_pushes d
      where d.user_id = t.id
        and d.local_day = coalesce((t.next_send at time zone t.tz)::date, (t.local_now)::date)
   )
   order by t.next_send nulls last
   limit greatest(p_limit, 1);
$$;

revoke all on function public.coach_message_limit(text) from public, anon, authenticated;
revoke all on function public.consume_coach_message(uuid) from public, anon, authenticated;
revoke all on function public.refund_coach_message(uuid) from public, anon, authenticated;
revoke all on function public.record_ai_usage(uuid, integer, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.add_bonus_messages(uuid, integer) from public, anon, authenticated;
revoke all on function public.safe_timezone(text) from public, anon, authenticated;
revoke all on function public.motivation_candidates(integer) from public, anon, authenticated;

grant execute on function public.coach_message_limit(text) to service_role;
grant execute on function public.consume_coach_message(uuid) to service_role;
grant execute on function public.refund_coach_message(uuid) to service_role;
grant execute on function public.record_ai_usage(uuid, integer, integer, integer, integer) to service_role;
grant execute on function public.add_bonus_messages(uuid, integer) to service_role;
grant execute on function public.safe_timezone(text) to service_role;
grant execute on function public.motivation_candidates(integer) to service_role;
