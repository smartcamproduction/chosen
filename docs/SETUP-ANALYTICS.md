# Analytics setup: PostHog (EU)

About 20 minutes. Analytics only runs for people who switch on **"Share anonymous analytics"** (onboarding
consent screen, or Profile → Privacy & legal). Everyone else sends nothing.

**What the app does (already built)**

- Sends events to PostHog's **EU cloud** (`eu.i.posthog.com`): data stays in the EU.
- Identifies people by their **Supabase user ID** only (never email or name). Person properties: plan (tier),
  language, country, and whether notifications / offers / AI are on.
- No location (GeoIP off), no money amounts, no crash reports.
- **Session replay** (TestFlight / App Store builds only, not Expo Go or web): every text field and every image
  is masked, so answers, messages, amounts and screenshots are never visible.
- Before someone decides (e.g. before sign-in), events wait **in memory only** for that app session. They are
  sent if the person says yes and thrown away if they say no or close the app.

---

## 1. Create the project

1. Go to **eu.posthog.com** (the **EU** cloud, not us.posthog.com) → sign up → organization `Chosen` →
   project `Chosen iOS`.
2. When it asks what you're building, pick **React Native**. Skip the install steps (done).
3. **Project settings** → **General** → copy the **Project API key** (`phc_…`). It's public by design.

## 2. Put the key into the app

- Local `.env` (see `.env.example`):
  ```
  EXPO_PUBLIC_POSTHOG_KEY=phc_xxxxxxxx
  EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
  ```
- Cloud builds: **expo.dev → project chosen → Environment variables** → add both (environment
  **production**, visibility **Plain text**), like in SETUP-PAYMENTS.md step 4.2.

## 3. Privacy settings in PostHog (do all of these)

**Project settings** in PostHog:

1. **Session replay** → switch **Record user sessions** on, and turn on recording for **mobile** apps.
   Keep **Mask all text inputs** on. Set **Minimum session duration** to 5 seconds.
2. **IP data capture** (under General or Privacy) → **Discard client IP data**: on.
3. **Data retention**: keep the default (or 1 year).
4. Organization settings → **Legal** (or the DPA page) → sign PostHog's **Data Processing Agreement**
   (needed for GDPR; takes a minute).

## 4. Connect RevenueCat (trial conversions and renewals)

Trial → paid and renewals happen on Apple's side, not in the app, so the app can't send them.
RevenueCat can: **RevenueCat → Integrations → PostHog** → paste the same `phc_…` key, host
`https://eu.i.posthog.com` → Save. RevenueCat then sends events like `rc_initial_purchase_event`,
`rc_renewal_event` and `rc_cancellation_event` with the same user ID, so they join our events.

## 5. Check it works

TestFlight build → new account → switch analytics **on** in onboarding → use the app for a minute →
PostHog → **Activity** (or **Events**) → you see `app_opened`, `$screen`, `onboarding_step_viewed`…
Session replays appear under **Replay** after a few minutes.

---

## The events

| Event | When | Properties |
| --- | --- | --- |
| `app_opened` | App starts or comes back from the background | `cold_start` |
| `$screen` | Every screen (route names like `/today`, `/task/[id]`) | |
| `onboarding_step_viewed` | Each onboarding screen, until the first hustle is locked in | `step`, `step_index` (1–7), `question` (quiz 1–16) |
| `spin` | Machine pulled | `signed_in`, `fun_spin` (during the 30-day lock), `spin_number` |
| `spin_result` | The machine picked a hustle | `hustle`, `spin_number`, `fun_spin` |
| `sign_in` | Signed in | `method` (apple / google / email), `new_account` |
| `quiz_completed` | Last onboarding question saved | `hours`, `budget`, `income_goal`, `first_earnings`, `experience`, `currency`, `source`, `has_referral` |
| `hustle_chosen` | A hustle was locked in | `hustle`, `slot`, `kind` (free / replace / locked), `fast_pivot`, `tier` |
| `onboarding_completed` | First hustle locked in on this phone | `hustle`, `tier` |
| `paywall_viewed` | Paywall opened | `source` (onboarding, coach, first_checkin, second_slot, personality, profile, roadmap, today, task, promo…), `item` (fast_pivot / messages), `plan` |
| `trial_started` | Free trial started | `product`, `tier`, `billing`, `currency`, `confirmed` |
| `purchase` | Anything paid (subscription without trial, Fast Pivot, messages) | `product`, `kind`, `tier`, `billing`, `price`, `currency`, `confirmed` |
| `restore` | Restore purchases | `tier`, `found` |
| `step_completed` | Roadmap step done | `step_id`, `xp`, `level_up`, `roadmap_completed`, `streak` |
| `checkin_submitted` | Weekly check-in | `week`, `has_revenue`, `profit_positive`, `screenshots`, `hours_logged`, `rank_up` |
| `coach_message_sent` | Message sent to the AI coach | `tier`, `images`, `from_bonus` |
| `coach_limit_reached` | Monthly coach messages used up | `tier`, `limit` |
| `share_card_created` | Story image made | `type` |
| `share_completed` | Share sheet closed, or invite link copied | `type`, `method` (image / link / invite_link_copied) |
| `referral_code_entered` | Referral code entered in onboarding | `valid` |
| `fast_pivot_used` | A Fast Pivot was spent | `slot`, `via` (unlock / direct_switch), `credits_left` |
| `notification_opened` | Push tapped | `kind` (motivation / nudge / promo), `url` |
| `account_deleted` | Account deleted | |

Every event also carries `app_env` (development / production). **Filter `app_env = production`** in every
insight so your own testing doesn't count.

Keep in mind: numbers only include people who allowed analytics. Use them for **rates and trends**
(conversion %, drop-off), not absolute user counts. For exact counts, use Supabase (users) and RevenueCat
(revenue, subscribers).

---

## Funnels to build (Product analytics → New insight → Funnel)

Set **conversion window** as noted, and **filter `app_env = production`**.

1. **Activation** (window 1 day): `onboarding_step_viewed` (step_index = 1) → `spin` → `spin_result` →
   `sign_in` (new_account = true) → `quiz_completed` → `onboarding_completed`.
   *Where do new people drop out before they commit?*
2. **Onboarding step drop-off** (window 1 day): one step per screen, `onboarding_step_viewed` with
   step_index = 1, 2, 3, 4, 5, 6, 7. Add a breakdown by `question` for step 6 to find the quiz question
   people quit on.
3. **Paywall conversion** (window 1 hour): `paywall_viewed` → `trial_started` OR `purchase` (kind =
   subscription). **Breakdown by `source`**: which moment sells best (end of onboarding, Coach, first check-in,
   Elite features)?
4. **Trial to paid** (window 7 days): `trial_started` → `rc_renewal_event` (from RevenueCat, step 4 above).
5. **First week habit** (window 7 days): `onboarding_completed` → `step_completed` → `checkin_submitted`
   (week = 1) → `coach_message_sent`.
6. **Message packs** (window 1 day): `coach_limit_reached` → `paywall_viewed` (item = messages) →
   `purchase` (kind = messages).
7. **Fast Pivot** (window 1 day): `paywall_viewed` (item = fast_pivot) → `purchase` (kind = fast_pivot) →
   `fast_pivot_used` → `hustle_chosen`.
8. **Sharing** (window 1 hour): `share_card_created` → `share_completed`. Breakdown by `type`.

## Other insights

- **Retention** (Retention insight, weekly): cohort event `onboarding_completed`, returning event
  `step_completed` or `checkin_submitted`. The most important chart for a 30-day-sprint app.
- **Stickiness**: `app_opened`, per week: how many days a week people come back.
- **Trends**: `trial_started` + `purchase` per day; `coach_message_sent` per day broken down by `tier`;
  `notification_opened` broken down by `kind`; `referral_code_entered` where valid = true.
- **Machine**: `spin_result` → `hustle_chosen` ratio, and `hustle_chosen` broken down by `hustle` (which ideas
  people actually commit to).

## Dashboards (Dashboards → New dashboard → add the insights above)

1. **Growth**: new accounts (`sign_in` with new_account = true), Activation funnel, onboarding completion
   rate, weekly `app_opened` users (WAU), Retention.
2. **Monetization**: `paywall_viewed` by source, Paywall conversion by source, trials and purchases per day,
   purchases by `product`, Trial to paid, Message packs, Fast Pivot, `restore` count.
3. **Engagement**: `step_completed` per day, `checkin_submitted` per week, `coach_message_sent` by tier,
   `coach_limit_reached`, notification opens by kind, Stickiness.
4. **Product health**: onboarding step drop-off, quiz question drop-off, spin → choose ratio, sharing funnel.

## Using session replays well

In **Replay**, filter recordings by events, e.g. sessions with `paywall_viewed` but no `trial_started`
(people who looked and left), or sessions that include `onboarding_step_viewed` step 6 but not
`quiz_completed`. Watch 10 of each: you'll see what confuses people.
