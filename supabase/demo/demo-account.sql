-- =====================================================================
-- Chosen · Demo account for Apple App Review
--
-- HOW TO USE (see docs/APP-STORE-CHECKLIST.md, "Demo account"):
--   1. Supabase → Authentication → Users → Add user → Create new user:
--      email appreview@chosen.app (or your own, then change it below),
--      a strong password, tick "Auto Confirm User" → Create.
--   2. SQL Editor → New query → paste this file → Run.
--   Safe to run again: it resets the demo account to the same state.
--
-- The account is on the Free plan (so reviewers can test the paywall and
-- the sandbox purchase), has finished onboarding and is on day 10 of the
-- "Newsletter" hustle with a few steps done and one weekly check-in.
-- =====================================================================
do $$
declare
  v_email   text := 'appreview@chosen.app';   -- ← change if you used another email
  v_uid     uuid;
  v_hustle  uuid;
  v_uh      uuid;
  v_steps   text[];
  v_tz      text := 'America/Los_Angeles';
  v_today   date;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'No user with email %. Create it first: Authentication → Users → Add user.', v_email;
  end if;
  select id into v_hustle from public.hustles where slug = 'newsletter';
  if v_hustle is null then
    raise exception 'Hustles are missing. Run the Phase 3 migration first.';
  end if;
  v_today := (now() at time zone v_tz)::date;

  -- Start clean (hustles cascade to steps, check-ins and coach messages).
  delete from public.user_hustles where user_id = v_uid;
  delete from public.user_badges where user_id = v_uid;
  delete from public.activity_days where user_id = v_uid;
  delete from public.coach_messages where user_id = v_uid;

  update public.profiles set
    display_name       = 'App Review',
    locale             = 'en',
    country            = 'US',
    currency           = 'USD',
    timezone           = v_tz,
    age_confirmed_at   = now() - interval '10 days',
    ai_consent_at      = now() - interval '10 days',
    analytics_consent  = false,
    promo_push_opt_in  = false,
    notification_time  = null,
    expo_push_token    = null,
    coach_personality  = 'balanced',
    quiz = jsonb_build_object(
      'version', 1, 'hours', '5to10', 'budget', 'lt50', 'skills', jsonb_build_array('writing'),
      'equipment', 'computer', 'incomeGoal', 'g500', 'firstEarnings', 'month1',
      'why', jsonb_build_array('freedom'), 'onCamera', 'no', 'clients', 'sometimes',
      'experience', 'none', 'audience', 'small', 'risk', 'medium', 'employment', 'employed',
      'runsBusiness', false, 'currency', 'USD', 'source', 'appstore', 'referralCode', null,
      'completedAt', to_char(now() - interval '10 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  where id = v_uid;

  insert into public.user_hustles (user_id, hustle_id, slot, started_at, lock_until)
  values (v_uid, v_hustle, 1, now() - interval '9 days 2 hours', now() + interval '20 days 22 hours')
  returning id into v_uh;

  -- The first three steps of the English roadmap.
  select array_agg(id) into v_steps from (
    select s.value ->> 'id' as id
      from public.roadmaps r,
           jsonb_array_elements(r.content -> 'phases') with ordinality as ph(value, pi),
           jsonb_array_elements(ph.value -> 'steps') with ordinality as s(value, si)
     where r.hustle_id = v_hustle and r.locale = 'en' and r.status = 'approved'
     order by r.version desc, ph.pi, s.si
     limit 3
  ) x;
  insert into public.step_progress (user_hustle_id, step_id, completed_at)
  select v_uh, v_steps[i], now() - make_interval(days => 9 - i * 2)
    from generate_series(1, coalesce(array_length(v_steps, 1), 0)) as i;

  insert into public.checkins (
    user_hustle_id, week_number, feeling, revenue, costs, currency, revenue_usd, costs_usd,
    hours, metrics, blockers, motivation, next_week_plan, completed_steps, created_at
  ) values (
    v_uh, 1, 4, 40, 12, 'USD', 40, 12,
    6, '{}'::jsonb, 'Finding the first readers took longer than planned.', 7,
    E'Publish issue #2\nPost in 2 communities\nAsk 5 friends for feedback',
    coalesce(v_steps, '{}'), now() - interval '2 days'
  );

  insert into public.user_badges (user_id, badge_id, earned_at) values
    (v_uid, 'first_spin', now() - interval '10 days'),
    (v_uid, 'chosen', now() - interval '9 days'),
    (v_uid, 'first_step', now() - interval '7 days'),
    (v_uid, 'first_checkin', now() - interval '2 days'),
    (v_uid, 'first_sale', now() - interval '2 days')
  on conflict do nothing;

  insert into public.activity_days (user_id, day)
  select v_uid, v_today - d from unnest(array[0, 1, 2, 5, 7, 9]) as d
  on conflict do nothing;

  update public.profiles set
    xp = 260, level = public.level_for_xp(260), rank = 'starter',
    streak_current = 3, streak_best = 3, last_active_date = v_today
  where id = v_uid;
end;
$$;
