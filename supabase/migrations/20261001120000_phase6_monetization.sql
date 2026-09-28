-- =====================================================================
-- Chosen · Phase 6: Monetization (RevenueCat)
--
-- HOW TO USE: run AFTER the Phase 5 file. Supabase → SQL Editor → New
-- query → paste this whole file → Run. Safe to run again.
--
-- Purchases happen in the app through RevenueCat (Apple / Google). The
-- server learns about them from RevenueCat itself (the revenuecat-webhook
-- and sync-purchases Edge Functions, secret REVENUECAT_SECRET_KEY) and is
-- the only place that changes:
--   • profiles.tier            free / pro / elite (every AI check uses it)
--   • credits.fast_pivot_credits  Fast Pivot purchases
--   • credits.bonus_messages      "100 more messages" + referral bonuses
-- This file adds:
--   • subscription details on the profile (plan, renewal date, trial…)
--   • bonus messages that never expire (they used to reset every month)
--   • a log of RevenueCat events and of every one-time purchase granted
--   • referral rewards (friend pays → referrer gets 1 month of Pro or 100
--     messages, friend gets 50 messages)
--   • use_fast_pivot(): spend a credit, leave the current hustle, choose again
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLE CHANGES
-- ---------------------------------------------------------------------

-- Subscription details (written by the server from RevenueCat; the app
-- can read them but never change them: they are not in the update grant).
alter table public.profiles
  add column if not exists subscription_product     text,
  add column if not exists subscription_store       text,
  add column if not exists subscription_expires_at  timestamptz,
  add column if not exists subscription_will_renew  boolean,
  add column if not exists subscription_is_trial    boolean not null default false,
  add column if not exists subscription_is_promo    boolean not null default false,
  add column if not exists subscription_synced_at   timestamptz;

-- Bonus coach messages are a balance that never expires.
alter table public.credits
  add column if not exists bonus_messages integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'credits_bonus_messages_check') then
    alter table public.credits add constraint credits_bonus_messages_check check (bonus_messages >= 0);
  end if;
end;
$$;

-- How many bonus messages were used in a month (for the numbers only).
alter table public.ai_usage
  add column if not exists bonus_used integer not null default 0;

-- Bonus messages used to belong to one month (ai_usage.bonus_messages).
-- Move what is left of this month's bonus to the new balance. After this
-- runs, ai_usage.bonus_messages is 0 everywhere, so running it again
-- moves nothing.
do $$
declare
  r        record;
  v_limit  integer;
  v_left   integer;
begin
  for r in
    select u.user_id, u.month, u.messages_used, u.bonus_messages, coalesce(p.tier, 'free') as tier
      from public.ai_usage u
      join public.profiles p on p.id = u.user_id
     where u.bonus_messages > 0
       and u.month = date_trunc('month', now() at time zone 'UTC')::date
  loop
    v_limit := public.coach_message_limit(r.tier);
    v_left  := greatest(0, least(r.bonus_messages, v_limit + r.bonus_messages - r.messages_used));
    insert into public.credits (user_id, bonus_messages) values (r.user_id, v_left)
    on conflict (user_id) do update set bonus_messages = public.credits.bonus_messages + excluded.bonus_messages;
    update public.ai_usage
       set bonus_used    = greatest(0, r.bonus_messages - v_left),
           messages_used = least(r.messages_used, v_limit)
     where user_id = r.user_id and month = r.month;
  end loop;
  update public.ai_usage set bonus_messages = 0 where bonus_messages <> 0;
end;
$$;

-- Every webhook call from RevenueCat (for support and debugging).
create table if not exists public.revenuecat_events (
  id              text primary key,             -- RevenueCat event id (duplicates are ignored)
  type            text not null,
  app_user_id     text,
  user_ids        uuid[] not null default '{}', -- our users this event was about
  product_id      text,
  store           text,
  environment     text,                         -- SANDBOX / PRODUCTION
  period_type     text,
  transaction_id  text,
  event_at        timestamptz,
  status          text not null default 'received'
                  check (status in ('received', 'processed', 'ignored', 'failed')),
  note            text,
  payload         jsonb not null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz
);
create index if not exists revenuecat_events_received_idx on public.revenuecat_events (received_at desc);
alter table public.revenuecat_events enable row level security;

drop policy if exists "admins: full access" on public.revenuecat_events;
create policy "admins: full access" on public.revenuecat_events for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- One row per one-time purchase that was turned into credits. The id is
-- the store's transaction id, so a purchase can never be granted twice
-- (not even to a different account after "Restore Purchases").
create table if not exists public.purchase_grants (
  id            text primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  product_id    text not null,
  kind          text not null check (kind in ('fast_pivot', 'messages')),
  amount        integer not null check (amount > 0),
  store         text,
  is_sandbox    boolean not null default false,
  purchased_at  timestamptz,
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz                  -- set when Apple / Google refunded it
);
create index if not exists purchase_grants_user_idx on public.purchase_grants (user_id);
alter table public.purchase_grants enable row level security;

drop policy if exists "admins: full access" on public.purchase_grants;
create policy "admins: full access" on public.purchase_grants for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "purchase_grants: read own" on public.purchase_grants;
create policy "purchase_grants: read own" on public.purchase_grants
  for select to authenticated using (user_id = (select auth.uid()));

-- Referral rewards.
--   pending   → the friend signed up with the code
--   qualified → the friend started a paid subscription (friend got 50 messages)
--   rewarded  → the referrer got 1 month of Pro, or 100 messages if they
--               were already subscribed
alter table public.referrals
  add column if not exists qualified_at        timestamptz,
  add column if not exists qualifying_product  text,
  add column if not exists referred_bonus_at   timestamptz,
  add column if not exists referrer_reward     text,
  add column if not exists reward_claimed_at   timestamptz,
  add column if not exists reward_error        text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'referrals_referrer_reward_check') then
    alter table public.referrals
      add constraint referrals_referrer_reward_check check (referrer_reward in ('pro_month', 'messages'));
  end if;
end;
$$;

-- =====================================================================
-- 2. FUNCTIONS FOR THE EDGE FUNCTIONS (service role only)
-- =====================================================================

-- Saves the plan RevenueCat reports. p_fetched_at is when RevenueCat was
-- asked: an older answer never overwrites a newer one.
--   p_state = { tier, product, store, expires_at, will_renew, is_trial, is_promo }
create or replace function public.apply_purchase_state(p_uid uuid, p_state jsonb, p_fetched_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier  text := p_state ->> 'tier';
  v_old   public.profiles;
begin
  if v_tier is null or v_tier not in ('free', 'pro', 'elite') then
    raise exception 'invalid_tier';
  end if;

  select * into v_old from public.profiles where id = p_uid for update;
  if not found then
    return null;
  end if;
  if v_old.subscription_synced_at is not null and v_old.subscription_synced_at > p_fetched_at then
    return jsonb_build_object('tier', v_old.tier, 'old_tier', v_old.tier, 'stale', true);
  end if;

  update public.profiles
     set tier                    = v_tier,
         subscription_product    = nullif(p_state ->> 'product', ''),
         subscription_store      = nullif(p_state ->> 'store', ''),
         subscription_expires_at = nullif(p_state ->> 'expires_at', '')::timestamptz,
         subscription_will_renew = (p_state ->> 'will_renew')::boolean,
         subscription_is_trial   = coalesce((p_state ->> 'is_trial')::boolean, false),
         subscription_is_promo   = coalesce((p_state ->> 'is_promo')::boolean, false),
         subscription_synced_at  = p_fetched_at
   where id = p_uid;

  return jsonb_build_object('tier', v_tier, 'old_tier', v_old.tier, 'stale', false);
end;
$$;

-- Turns a one-time purchase into credits, once. Returns true if granted now.
create or replace function public.grant_consumable(
  p_uid           uuid,
  p_grant_id      text,
  p_product       text,
  p_kind          text,
  p_amount        integer,
  p_store         text,
  p_is_sandbox    boolean,
  p_purchased_at  timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = p_uid) then
    return false;
  end if;

  insert into public.purchase_grants (id, user_id, product_id, kind, amount, store, is_sandbox, purchased_at)
  values (p_grant_id, p_uid, p_product, p_kind, p_amount, p_store, coalesce(p_is_sandbox, false), p_purchased_at)
  on conflict (id) do nothing;
  if not found then
    return false;
  end if;

  if p_kind = 'fast_pivot' then
    insert into public.credits (user_id, fast_pivot_credits) values (p_uid, p_amount)
    on conflict (user_id) do update set fast_pivot_credits = public.credits.fast_pivot_credits + excluded.fast_pivot_credits;
  else
    insert into public.credits (user_id, bonus_messages) values (p_uid, p_amount)
    on conflict (user_id) do update set bonus_messages = public.credits.bonus_messages + excluded.bonus_messages;
  end if;
  return true;
end;
$$;

-- A refunded one-time purchase: take the credits back (never below 0).
create or replace function public.revoke_consumable(p_grant_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v  public.purchase_grants;
begin
  update public.purchase_grants set revoked_at = now()
   where id = p_grant_id and revoked_at is null
  returning * into v;
  if not found then
    return null;
  end if;

  if v.kind = 'fast_pivot' then
    update public.credits set fast_pivot_credits = greatest(0, fast_pivot_credits - v.amount) where user_id = v.user_id;
  else
    update public.credits set bonus_messages = greatest(0, bonus_messages - v.amount) where user_id = v.user_id;
  end if;
  return jsonb_build_object('user_id', v.user_id, 'kind', v.kind, 'amount', v.amount);
end;
$$;

-- Bonus messages (purchases and referrals). They never expire.
create or replace function public.add_bonus_messages(p_uid uuid, p_amount integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.credits (user_id, bonus_messages)
  select p_uid, greatest(p_amount, 0)
   where exists (select 1 from public.profiles where id = p_uid)
  on conflict (user_id) do update set
    bonus_messages = public.credits.bonus_messages + excluded.bonus_messages;
$$;

-- Takes one coach message: first from the plan's monthly allowance
-- (Pro 150, Elite 400), then from the bonus balance.
-- Returns { ok, used, limit, bonus, source } (bonus = balance left).
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
  v_bonus  integer;
begin
  select p.tier into v_tier from public.profiles p where p.id = p_uid;
  v_limit := public.coach_message_limit(coalesce(v_tier, 'free'));

  insert into public.ai_usage (user_id, month) values (p_uid, v_month)
  on conflict (user_id, month) do nothing;
  select * into v_row from public.ai_usage where user_id = p_uid and month = v_month for update;

  insert into public.credits (user_id) values (p_uid) on conflict (user_id) do nothing;
  select c.bonus_messages into v_bonus from public.credits c where c.user_id = p_uid for update;

  if v_row.messages_used < v_limit then
    update public.ai_usage set messages_used = messages_used + 1
     where user_id = p_uid and month = v_month;
    return jsonb_build_object('ok', true, 'used', v_row.messages_used + 1, 'limit', v_limit, 'bonus', v_bonus, 'source', 'plan');
  end if;

  -- Bonus messages only work with a paid plan (the coach is Pro / Elite).
  if v_limit > 0 and v_bonus > 0 then
    update public.credits set bonus_messages = bonus_messages - 1 where user_id = p_uid;
    update public.ai_usage set bonus_used = bonus_used + 1 where user_id = p_uid and month = v_month;
    return jsonb_build_object('ok', true, 'used', v_row.messages_used, 'limit', v_limit, 'bonus', v_bonus - 1, 'source', 'bonus');
  end if;

  return jsonb_build_object('ok', false, 'used', v_row.messages_used, 'limit', v_limit, 'bonus', v_bonus);
end;
$$;

-- Gives a message back when the AI call failed (to where it came from).
drop function if exists public.refund_coach_message(uuid);
create or replace function public.refund_coach_message(p_uid uuid, p_source text default 'plan')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month  date := date_trunc('month', now() at time zone 'UTC')::date;
begin
  if p_source = 'bonus' then
    update public.credits set bonus_messages = bonus_messages + 1 where user_id = p_uid;
    update public.ai_usage set bonus_used = greatest(0, bonus_used - 1) where user_id = p_uid and month = v_month;
  else
    update public.ai_usage set messages_used = greatest(0, messages_used - 1) where user_id = p_uid and month = v_month;
  end if;
end;
$$;

-- The referred friend started a paid subscription: mark the referral
-- qualified (once) and give the friend 50 bonus messages. Returns the
-- referral still waiting for the referrer's reward, or null.
create or replace function public.referral_qualify(p_referred uuid, p_product text, p_friend_bonus integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v  public.referrals;
begin
  update public.referrals
     set status = 'qualified', qualified_at = now(), qualifying_product = p_product
   where referred_id = p_referred and status = 'pending'
  returning * into v;

  if found then
    perform public.add_bonus_messages(p_referred, p_friend_bonus);
    update public.referrals set referred_bonus_at = now() where id = v.id;
  end if;

  select * into v from public.referrals where referred_id = p_referred and status = 'qualified';
  if not found then
    return null;
  end if;
  return jsonb_build_object('id', v.id, 'referrer_id', v.referrer_id);
end;
$$;

-- Only one server call may hand out a referrer's reward at a time. A claim
-- that was never finished (e.g. the function crashed) expires after 10 min.
create or replace function public.referral_claim(p_referral_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.referrals set reward_claimed_at = now()
   where id = p_referral_id
     and status = 'qualified'
     and (reward_claimed_at is null or reward_claimed_at < now() - interval '10 minutes');
  return found;
end;
$$;

-- The referrer's reward was handed out. For 'messages' this also adds the
-- 100 bonus messages (in the same step, so it can't happen twice).
create or replace function public.referral_rewarded(p_referral_id uuid, p_reward text, p_messages integer default 100)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referrer  uuid;
begin
  if p_reward not in ('pro_month', 'messages') then
    raise exception 'invalid_reward';
  end if;
  update public.referrals
     set status = 'rewarded', rewarded_at = now(), referrer_reward = p_reward, reward_error = null
   where id = p_referral_id and status = 'qualified'
  returning referrer_id into v_referrer;
  if not found then
    return false;
  end if;
  if p_reward = 'messages' then
    perform public.add_bonus_messages(v_referrer, p_messages);
  end if;
  return true;
end;
$$;

-- Handing out the reward failed: release the claim so the next try can.
create or replace function public.referral_release(p_referral_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.referrals
     set reward_claimed_at = null, reward_error = left(p_error, 500)
   where id = p_referral_id and status = 'qualified';
$$;

-- =====================================================================
-- 3. FUNCTIONS THE APP CALLS
-- =====================================================================

-- Fast Pivot: spends one credit, marks the current (still locked) hustle
-- 'abandoned' and frees the slot, so the user can choose again right away.
-- XP, badges and the streak are kept. Returns the credits left.
create or replace function public.use_fast_pivot(p_slot integer default 1)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_current  public.user_hustles;
  v_left     integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_slot not in (1, 2) then
    raise exception 'invalid_slot';
  end if;

  select * into v_current
    from public.user_hustles uh
   where uh.user_id = v_uid and uh.slot = p_slot and uh.status = 'active'
   for update;
  if not found then
    raise exception 'no_active_hustle';
  end if;
  -- Nothing to pivot out of: the 30 days are over or the roadmap is done.
  if v_current.lock_until <= now() or v_current.completed_at is not null then
    raise exception 'not_locked';
  end if;

  update public.credits
     set fast_pivot_credits = fast_pivot_credits - 1
   where user_id = v_uid and fast_pivot_credits > 0
  returning fast_pivot_credits into v_left;
  if not found then
    raise exception 'no_fast_pivot_credits';
  end if;

  update public.user_hustles set status = 'abandoned' where id = v_current.id;
  return v_left;
end;
$$;

-- Referral codes: only before you subscribe (rewards are for bringing in
-- new paying users). Otherwise the same as before.
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
  if exists (select 1 from public.profiles p
              where p.id = v_uid and (p.referred_by is not null or p.tier <> 'free' or p.subscription_product is not null)) then
    return false;
  end if;

  update public.profiles set referred_by = v_referrer where id = v_uid;
  insert into public.referrals (referrer_id, referred_id)
  values (v_referrer, v_uid)
  on conflict (referred_id) do nothing;
  return true;
end;
$$;

-- =====================================================================
-- 4. PERMISSIONS
-- =====================================================================
revoke all on function public.apply_purchase_state(uuid, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.grant_consumable(uuid, text, text, text, integer, text, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.revoke_consumable(text) from public, anon, authenticated;
revoke all on function public.add_bonus_messages(uuid, integer) from public, anon, authenticated;
revoke all on function public.consume_coach_message(uuid) from public, anon, authenticated;
revoke all on function public.refund_coach_message(uuid, text) from public, anon, authenticated;
revoke all on function public.referral_qualify(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.referral_claim(uuid) from public, anon, authenticated;
revoke all on function public.referral_rewarded(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.referral_release(uuid, text) from public, anon, authenticated;
revoke all on function public.use_fast_pivot(integer) from public, anon;
revoke all on function public.redeem_referral(text) from public, anon;

grant execute on function public.apply_purchase_state(uuid, jsonb, timestamptz) to service_role;
grant execute on function public.grant_consumable(uuid, text, text, text, integer, text, boolean, timestamptz) to service_role;
grant execute on function public.revoke_consumable(text) to service_role;
grant execute on function public.add_bonus_messages(uuid, integer) to service_role;
grant execute on function public.consume_coach_message(uuid) to service_role;
grant execute on function public.refund_coach_message(uuid, text) to service_role;
grant execute on function public.referral_qualify(uuid, text, integer) to service_role;
grant execute on function public.referral_claim(uuid) to service_role;
grant execute on function public.referral_rewarded(uuid, text, integer) to service_role;
grant execute on function public.referral_release(uuid, text) to service_role;
grant execute on function public.use_fast_pivot(integer) to authenticated;
grant execute on function public.redeem_referral(text) to authenticated;
