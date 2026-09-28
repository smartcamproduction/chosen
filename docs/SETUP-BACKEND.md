# Backend setup: Supabase, Sign in with Apple, Google

Do these in order. Roughly 45–60 minutes. You need: a Supabase account (free), an
Apple Developer Program membership ($99/year), and a Google account.

Your app's identifiers (already set in `app.json`). Change them now if you want different ones, then use your versions everywhere below:

- iOS bundle ID and Android package: `com.chosencoach.app`
- Deep-link scheme: `chosen`

---

## Part A: Supabase project

1. Go to **supabase.com** → **Start your project** → sign in → **New project**.
   - Name: `chosen`
   - Database password: click **Generate**, then save it in your password manager.
   - Region: **Central EU (Frankfurt)**. EU users' data stays in the EU (GDPR).
   - Click **Create new project** and wait about 2 minutes.
2. Left menu → **SQL Editor** → **New query**. Run the files in `supabase/migrations/` **in order**,
   one query each (open in Notepad → copy everything → paste → **Run**):
   1. `20260927120000_phase2_schema.sql` (tables, security, storage)
   2. `20260928120000_phase3_machine.sql` (machine rules + the 15 hustles)
   3. `20260929120000_phase4_progress.sql` (XP, streaks, ranks, badges, check-ins, "Top X%")
   4. `20260929120100_phase4_seed.sql` (the 15 roadmaps in English + Polish, daily messages).
      This one is large (about 270 KB). Pasting takes a few seconds; that's normal.
   5. `20260930120000_phase5_ai.sql` (AI coach limits, token usage, daily pushes, AI jobs)
   6. `20261001120000_phase6_monetization.sql` (purchases, bonus messages that never expire,
      referral rewards, Fast Pivot). The rest of the payments setup is in
      [SETUP-PAYMENTS.md](SETUP-PAYMENTS.md).
   7. `20261002120000_phase7_privacy_notifications.sql` (consent log, "Offers & news" opt-in,
      promotional campaigns). See Part A3.

   Each should end with *"Success. No rows returned"*. All are safe to run again.
3. Check it worked:
   - **Table Editor** → `hustles` → 15 rows.
   - **Table Editor** → `roadmaps` → 30 rows (15 hustles × 2 languages), all `approved`.
   - **Table Editor** → `badges` → 9 rows. `exchange_rates` → 4 rows (USD, EUR, GBP, PLN).
   - **Storage** → a bucket called `checkins` marked *Private*.
4. Left menu → **Project Settings** (gear) → **API Keys**. Copy two values:
   - **Project URL** (looks like `https://abcdefghijk.supabase.co`). It's also under **Data API**.
   - The **Publishable key** (`sb_publishable_…`). If you only see *Legacy API keys*, copy the **anon public** key.
   - **Never** copy the *secret* / *service_role* key into the app.
5. In the project folder `C:\Firma\APKA\chosen`, copy `.env.example` to a new file named `.env`
   and paste the two values:
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://abcdefghijk.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxx
   ```
   Restart the app (`Ctrl + C`, then `npx expo start`) so it reads the new values.
6. **Authentication** → **Sign In / Providers**:
   - **Email**: switch **off** "Enable Email provider" for now (people sign up with Apple and Google).
     Before you submit to the App Store, switch it **on** for the App Review demo account
     ([APP-STORE-CHECKLIST.md](APP-STORE-CHECKLIST.md) step 6). The app has no email sign-up form,
     only "Sign in with email" for accounts you create yourself.
   - Keep this page open. You'll fill in Apple and Google in Parts B and C.
7. **Authentication** → **URL Configuration**:
   - **Site URL**: `chosen://`
   - **Redirect URLs** → **Add URL**, one at a time:
     - `chosen://**`   (the real app)
     - `exp://**`      (testing in Expo Go)
     - `http://localhost:8081/**`   (web preview on your PC)
8. Deploy the account-deletion function:
   - Left menu → **Edge Functions** → **Deploy a new function** → **Via Editor**.
   - Name it exactly `delete-account`.
   - Delete the sample code, paste everything from `supabase/functions/delete-account/index.ts`, and click **Deploy**.
   - Leave **Verify JWT** on (default). No secrets to add; Supabase provides them automatically.
   - *(Alternative, if the editor isn't available: in PowerShell run `npx supabase login`, then
     `npx supabase link --project-ref YOUR-REF`, then `npx supabase functions deploy delete-account`.)*
9. Deploy the exchange-rate function (keeps ranks fair across currencies):
   - **Edge Functions** → **Deploy a new function** → **Via Editor** → name it exactly `refresh-exchange-rates`.
   - Paste everything from `supabase/functions/refresh-exchange-rates/index.ts` → **Deploy**.
   - Test it: on the function's page click **Test** (or **Invoke**) → you should see `"ok": true`
     and today's rates. **Table Editor** → `exchange_rates` now shows today's date.
10. Run it every day automatically:
    - Left menu → **Integrations** → **Cron** → enable it if asked → **Create job**.
    - Name: `refresh-exchange-rates`. Schedule: `0 6 * * *` (every day at 06:00 UTC).
    - Type: **Supabase Edge Function** → pick `refresh-exchange-rates` → method **POST**.
    - If the form offers **Add auth header** (with the service role key), switch it **on**. If it shows a
      **Headers** box instead, add `Authorization` = `Bearer ` followed by your **anon / publishable** key.
    - **Create**.
    - If you skip this, the app still works with the rates from 27 Sep 2026; they just won't update.

---

## Part A2: AI coach (Claude)

The AI runs only in Supabase Edge Functions. The Claude API key is stored as a Supabase **secret** and
never goes into the app.

1. **Get a Claude API key:** go to **console.anthropic.com** → sign up → **Billing** → add a payment
   method and some credit (e.g. $20). Then **API Keys** → **Create Key** → name `chosen` → copy it
   (it starts with `sk-ant-`). Under **Limits**, set a monthly spend limit you're comfortable with.
2. **Store it in Supabase:** **Edge Functions** → **Secrets** (or **Project Settings → Edge Functions**)
   → **Add new secret**: name `ANTHROPIC_API_KEY`, value = your key → **Save**.
   Optional secrets (you can skip them):
   - `MOTIVATION_MODEL`: model for the daily line. Default `claude-haiku-4-5-20251001`. Anthropic may
     retire that model from **15 Oct 2026**; if the daily line stops working after that, set this to
     `claude-haiku-4-5` or another current small model. No code change needed.
   - `COACH_MODEL`: model for the chat and roadmaps. Default `claude-sonnet-5`.
   - `EXPO_ACCESS_TOKEN`: only if you turn on "enhanced push security" in your Expo account.
3. **Deploy the 5 AI functions** exactly like `delete-account` (Edge Functions → Deploy a new function →
   Via Editor → exact name → paste the whole file → Deploy, **Verify JWT** on):
   | Name | File |
   | --- | --- |
   | `coach-chat` | `supabase/functions/coach-chat/index.ts` |
   | `checkin-feedback` | `supabase/functions/checkin-feedback/index.ts` |
   | `personalize-roadmap` | `supabase/functions/personalize-roadmap/index.ts` |
   | `generate-roadmap` | `supabase/functions/generate-roadmap/index.ts` |
   | `daily-motivation` | `supabase/functions/daily-motivation/index.ts` |

   Each file is long because the shared code is copied into it. That's on purpose, so each one is a
   single paste. If you ever change `supabase/functions/_shared/chosen.ts`, run `npm run sync:functions`
   and redeploy all five.
4. **Schedule the daily message:** **Integrations → Cron → Create job**:
   - Name `daily-motivation`, schedule `*/15 * * * *` (every 15 minutes).
   - Type **Supabase Edge Function** → `daily-motivation` → method **POST** → body `{"mode":"all"}`.
   - Auth header: the same as for `refresh-exchange-rates` (step A10).

   It runs every 15 minutes so each person gets their push at their own chosen time. Each person's
   line is written only once a day.
5. **Supabase plan:** functions may run for up to 150 seconds on the free plan (400 on Pro).
   Personalizing a roadmap takes about 1–2 minutes, so switch to the **Pro plan** before launch.
   You'll need it for launch anyway.

### Push notifications (the daily coach message)

Push needs an **Expo project ID**. One time, in PowerShell in `C:\Firma\APKA\chosen`:

```bash
npx eas-cli@latest login
```

(create a free account at expo.dev if you don't have one), then:

```bash
npx eas-cli@latest init
```

Answer **Yes** to create the project. It adds `extra.eas.projectId` to `app.json`. Restart
`npx expo start`. On the iPhone: **Profile → Notifications → Daily briefing** → switch it on → **Allow**.
Pick the time with the chip next to it. (On Android, push needs a development build; iPhone with Expo
Go works.)

### Test the AI without buying

Until RevenueCat is set up ([SETUP-PAYMENTS.md](SETUP-PAYMENTS.md)), make yourself Pro by hand
(SQL Editor, your email). Once purchases are live, the next purchase event for that account
overwrites this; use RevenueCat's **Grant entitlement** instead (see SETUP-PAYMENTS.md).

```sql
update public.profiles set tier = 'pro'
where id = (select id from auth.users where email = 'you@example.com');
```

Use `'elite'` to test the coach styles and the second hustle, and `'free'` to go back. In the app,
choose a hustle or open **Roadmap**: "Personalizing your roadmap…" appears and turns into
"Personalized for you" after about a minute. Then open **Coach** and send a message.
**Table Editor** → `coach_messages` and `ai_usage` show the messages and token counts.

### Approximate AI costs (Claude API prices, Sep 2026)

- Coach message (Sonnet 5): about $0.006–0.013. A Pro user who uses all 150 messages ≈ $1–2 / month.
- Check-in analysis with screenshots: about $0.02–0.04 each.
- Roadmap personalization: about $0.08 once per hustle.
- Daily line (Haiku 4.5): well under $0.001 per user per day.

Prompt caching keeps repeat context cheap (reading cached context costs 10% of the normal price).

---

## Part A3: Notifications, privacy and offers (Phase 7)

1. **SQL Editor** → run `20261002120000_phase7_privacy_notifications.sql` (Success).
2. **Re-deploy** `daily-motivation` (open it → **Code** → replace everything with
   `supabase/functions/daily-motivation/index.ts` → **Deploy**). Pushes now say whether they're the daily
   message or a check-in nudge, for analytics.
3. **Deploy** the new function `promo-push` (Deploy a new function → Via Editor → name `promo-push` →
   paste `supabase/functions/promo-push/index.ts` → **Deploy**, **Verify JWT** on). Admins use it from the
   app: **Profile → Admin → Offers & news notification**. It only reaches people who switched on
   "Offers & news" in Profile (off by default), and every send is logged in `promo_campaigns`.
4. How notifications work now:
   - Right after someone chooses a hustle, the app explains the daily coach message and then asks for
     permission (once).
   - Daily coach message: at the time the person picked (default 09:00), in their own time zone.
   - After 8 days without a check-in, that day's message becomes a nudge to check in.
   - "Offers & news": a separate switch in Profile, off by default.
5. Consent records: **Table Editor → consent_log** shows every time someone switched AI sharing,
   analytics or offers on or off, with the time (proof of consent for GDPR). People can see their own.

Analytics (PostHog): [SETUP-ANALYTICS.md](SETUP-ANALYTICS.md). App Store submission:
[APP-STORE-CHECKLIST.md](APP-STORE-CHECKLIST.md).

---

## Part B: Sign in with Apple (Apple Developer)

1. Go to **developer.apple.com/account** → **Certificates, Identifiers & Profiles** → **Identifiers** → **+**.
2. Choose **App IDs** → **Continue** → **App** → **Continue**.
3. Description: `Chosen`. Bundle ID: **Explicit** → `com.chosencoach.app`.
4. In **Capabilities**, tick **Sign In with Apple**. Leave its settings as "Enable as a primary App ID".
5. **Continue** → **Register**.
6. Back in **Supabase** → Authentication → Sign In / Providers → **Apple**:
   - Switch it **on**.
   - **Client IDs**: `com.chosencoach.app,host.exp.Exponent`
     (the second one lets sign-in work inside the Expo Go test app).
   - Leave **Secret Key (for OAuth)** empty. It's only needed for Apple sign-in on Android/web, which comes later.
   - **Save**.

That's all Apple needs for iPhone. The build certificates are created automatically later, when we
make the TestFlight build with EAS.

---

## Part C: Continue with Google (Google Cloud)

1. Go to **console.cloud.google.com** → project picker (top left) → **New project** → name `Chosen` → **Create**, then select it.
2. Menu → **Google Auth Platform** (also listed as **APIs & Services → OAuth consent screen**) → **Get started**:
   - App name: `Chosen`. User support email: your email → **Next**.
   - Audience: **External** → **Next**.
   - Contact email: your email → **Next** → agree → **Create**.
3. **Branding** → **Authorized domains** → **Add domain**: `YOUR-REF.supabase.co`
   (the part of your Project URL after `https://`). **Save**.
4. **Data Access** → **Add or remove scopes** → tick `openid`, `.../auth/userinfo.email`,
   `.../auth/userinfo.profile` → **Update** → **Save**.
5. **Clients** → **Create client**:
   - Application type: **Web application**. Name: `Chosen (Supabase)`.
   - **Authorized redirect URIs** → **Add URI**: `https://YOUR-REF.supabase.co/auth/v1/callback`
     (Supabase shows this exact address on its Google provider page as "Callback URL").
   - **Create**, then copy the **Client ID** and **Client secret**.
6. **Audience** → **Publish app** → **Confirm**. Until you do this, only test users you
   add by hand can sign in. The basic scopes above don't need Google's review.
7. Back in **Supabase** → Authentication → Sign In / Providers → **Google**:
   switch it **on**, paste **Client ID** and **Client Secret** → **Save**.

---

## Part D: Test on your iPhone

1. `npx expo start` in `C:\Firma\APKA\chosen`, then scan the QR code (Expo Go).
2. Spin → **Choose this** → tick your commitment → **Sign in with Apple** (or Google).
3. Age check → privacy choices → 16 questions → **Lock in for 30 days** → Today.
4. In Supabase → **Table Editor**, you should see your row in `profiles` (with `quiz` filled in),
   one row in `user_hustles`, and your spins in `spins`.
5. Phase 4 checks:
   - Today → tick the first step. A "+40 XP" celebration appears (30 XP for the step + 10 for your
     first active day). `step_progress` gets a row, and `profiles.xp` shows 40.
   - `user_badges` shows First Spin, Chosen and First Step.
   - Weekly check-ins open on day 7. To test sooner, in **SQL Editor** run (your email):
     ```sql
     update public.user_hustles set started_at = now() - interval '6 days 1 hour'
     where user_id = (select id from auth.users where email = 'you@example.com') and status = 'active';
     ```
     Then fill in the check-in with a screenshot. A row appears in `checkins`, and the picture appears
     under **Storage → checkins → your user id**.
6. Profile → **Delete account & data** → confirm. Your rows disappear and
   **Authentication → Users** no longer lists you.

## Part E: Make yourself an admin

After you've signed in once: Supabase → **SQL Editor** → run (use your sign-in email):

```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'you@example.com');
```

With Apple "Hide my email", your address looks like `xxxx@privaterelay.appleid.com`. You'll find it
under **Authentication → Users**.

As an admin you'll see **Profile → Admin · Roadmaps** in the app. There you can:
- **Generate draft**: Claude writes a new base roadmap for a hustle and language (1–2 minutes).
- **Preview** a draft, then **Approve** it (it becomes the base roadmap for everyone on that hustle in
  that language) or **Delete** it. Always check the steps and links before approving.

---

### Good to know

- **Free Supabase plan**: projects pause after 1 week without activity. Upgrade to Pro
  (about $25/month) before launch.
- The database is the source of truth for the 15 hustles. To change their texts, edit
  `src/data/hustles.seed.json`, run `npm run seed:hustles`, then run
  `20260928120000_phase3_machine.sql` again in the SQL Editor (it's safe to re-run).
- Share cards contain a QR code and invite link pointing to `INVITE_BASE_URL` in `src/config.ts`
  (currently the placeholder `https://chosen.app/invite`). Replace it with your real website or App Store link.
- **Roadmaps** live in `src/data/roadmaps/` (one file per hustle, English and Polish side by side).
  After editing: run `npm run seed:phase4` (it checks every step and rewrites
  `20260929120100_phase4_seed.sql`), then run that file again in the SQL Editor.
  Users only see roadmaps with status `approved`. To try a new version safely, add it in the Table Editor
  as version 2 with status `draft`, and switch it to `approved` when it's ready.
- **Affiliate links**: paste your personal links into `src/data/roadmaps/affiliate-links.json` (next to
  the tool's name), then do the same two steps as above. Tools with a link show an "Affiliate link" tag.
- **Check the roadmap links** any time with `npm run check:links`. Sites like Etsy, Canva and Fiverr block
  automated checks and show `403`; open those in a browser to confirm.
- **"Top X% in your country"** only appears when at least 50 people in the same country run the same
  hustle. Until then, users are compared with their own previous weeks.
