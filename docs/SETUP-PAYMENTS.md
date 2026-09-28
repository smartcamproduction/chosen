# Payments setup: App Store Connect, RevenueCat, Supabase

Do these parts in order. About 2 hours in total, plus Apple's waiting times. You need the Supabase
project from [SETUP-BACKEND.md](SETUP-BACKEND.md) and an Apple Developer account.

**How it works (in one minute)**

- The iPhone shows prices and the Apple payment sheet through **RevenueCat**.
- After a purchase, RevenueCat tells our server (the `revenuecat-webhook` function), and the app also asks
  the server to check (`sync-purchases`). The server asks RevenueCat with a **secret key** what the person
  really owns, then updates `profiles.tier` and the credits. The app can never give itself a plan or credits.
- Every AI feature checks `profiles.tier` on the server.

**What you are selling**

| What | Product ID (type it exactly) | Type | Price | Free trial |
| --- | --- | --- | --- | --- |
| Pro monthly | `chosen_pro_monthly` | Auto-renewable subscription, 1 month | $39.99 | 3 days |
| Pro yearly | `chosen_pro_yearly` | Auto-renewable subscription, 1 year | $249.99 | 3 days |
| Elite monthly | `chosen_elite_monthly` | Auto-renewable subscription, 1 month | $99.99 | none |
| Elite yearly | `chosen_elite_yearly` | Auto-renewable subscription, 1 year | $599.99 | none |
| Fast Pivot | `chosen_fast_pivot` | Consumable | $29.99 | – |
| 100 coach messages | `chosen_messages_100` | Consumable | $9.99 | – |

Product IDs can never be reused, not even after deleting a product. Copy them from this table.

---

## Part 1: App Store Connect (appstoreconnect.apple.com)

### 1.1 Paid Apps agreement (do this first, Apple can take a day)

1. **Business** (top menu; older name: *Agreements, Tax, and Banking*) → **Paid Apps** → **View and Agree to Terms**.
2. Add your **bank account** and fill in the **tax forms** (U.S. W-8BEN for a Polish company/person).
3. Wait until the Paid Apps status is **Active**. Until then no product loads, not even for testing.

### 1.2 The app record (skip if you already have it)

1. **Apps** → **+** → **New App**: platform **iOS**, name **Chosen: Side Hustle Coach**, primary language
   **English (U.S.)**, bundle ID **com.chosencoach.app**, SKU `chosen-ios`, access **Full Access** → **Create**.
   - If the bundle ID isn't in the list: developer.apple.com → **Certificates, IDs & Profiles** →
     **Identifiers** → **+** → **App IDs** → **App** → description `Chosen`, **Explicit** bundle ID
     `com.chosencoach.app`, tick **Sign In with Apple** → **Register**. Then try again.
     (The first EAS build in Part 4 can also create it for you.)

### 1.3 Subscription group

1. Open your app → left menu **Monetization** → **Subscriptions** → next to **Subscription Groups** click **+**.
2. Reference name: `Chosen Premium` → **Create**.
3. In the group, under **App Store Localization** → **Create**: English (U.S.) display name `Chosen Premium`.
   Add a second localization for **Polish**: `Chosen Premium`.

### 1.4 The four subscriptions

In the group, next to **Subscriptions** click **Create** (or **+**) four times:

| Reference name | Product ID | Subscription Duration |
| --- | --- | --- |
| Chosen Pro Monthly | `chosen_pro_monthly` | 1 Month |
| Chosen Pro Yearly | `chosen_pro_yearly` | 1 Year |
| Chosen Elite Monthly | `chosen_elite_monthly` | 1 Month |
| Chosen Elite Yearly | `chosen_elite_yearly` | 1 Year |

For **each** subscription, fill in its page:

1. **Availability** → **Set Up Availability** → select **all countries** → **Confirm**.
2. **Subscription Prices** → **Add Subscription Price** → country **United States** → price from the table at
   the top ($39.99 / $249.99 / $99.99 / $599.99) → **Next**. Apple fills in every other country (you can
   change e.g. Poland on the next screen) → **Confirm**.
3. **App Store Localization** → **+** → **English (U.S.)**:
   - Pro: display name `Pro`, description `AI coach, 150 messages a month, personalized roadmap.`
   - Elite: display name `Elite`, description `Everything in Pro, 400 messages, 2 hustles, coach styles.`
   Add **Polish** too:
   - Pro: `Pro`, `Coach AI, 150 wiadomości miesięcznie, spersonalizowany plan.`
   - Elite: `Elite`, `Wszystko z Pro, 400 wiadomości, 2 biznesy, style coacha.`
4. **Review Information** → **Screenshot**: a screenshot of the paywall (you can add it after your first
   TestFlight build, it's only needed before you submit). **Review Notes**: `Opened from the paywall
   (Profile → See plans). Pro has a 3-day free trial.`
5. **Save**. The status becomes **Ready to Submit** once everything is filled in. (While it says
   **Missing Metadata** the product may not load in testing.)

### 1.5 Levels: Elite above Pro

On the group page, click **Edit** next to the subscription list (or drag the rows) so that:

- **Level 1**: Chosen Elite Monthly and Chosen Elite Yearly
- **Level 2**: Chosen Pro Monthly and Chosen Pro Yearly

This makes Pro → Elite an **upgrade** (starts immediately; Apple refunds the unused part) and
Elite → Pro a downgrade at the next renewal. People can only have one plan at a time.

### 1.6 The 3-day free trial (Pro only)

1. Open **Chosen Pro Monthly** → **Subscription Prices** section → **+** (next to *Introductory Offers*,
   or **View all Subscription Pricing** → **Introductory Offers** → **Set Up Introductory Offer**).
2. Countries: **all** → Start date: today, **No End Date** → **Next**.
3. Type: **Free** → Duration: **3 Days** → **Next** → **Confirm**.
4. Do the same for **Chosen Pro Yearly**. **Don't** add a trial to Elite.

Apple gives one free trial per person per subscription group. The app checks this and only says
"Start 3-day free trial" to people who can still get it.

### 1.7 The two one-time purchases

**Monetization** → **In-App Purchases** → **+** → type **Consumable**:

| Reference name | Product ID | Price |
| --- | --- | --- |
| Fast Pivot | `chosen_fast_pivot` | $29.99 |
| 100 Coach Messages | `chosen_messages_100` | $9.99 |

For each: **Availability** (all countries) → **Price Schedule** → **Add Pricing** (United States, price) →
**App Store Localization** (English: `Fast Pivot` / `Switch to a new hustle before day 30.` and
`100 Coach Messages` / `100 extra AI coach messages that never expire.`; Polish: `Fast Pivot` /
`Zmień biznes przed 30. dniem.` and `100 wiadomości do coacha` / `100 dodatkowych wiadomości, które nie
wygasają.`) → **Review Information** (screenshot of the Fast Pivot / messages screen, add it later) → **Save**.

### 1.8 In-App Purchase Key (RevenueCat needs it, required)

1. **Users and Access** → **Integrations** → **In-App Purchase** → **Generate In-App Purchase Key**
   (or **+** if you already have one).
2. Name: `RevenueCat` → **Generate**.
3. **Download** the `.p8` file now (Apple lets you download it only once). Keep it in your password manager.
4. Note the **Issuer ID** shown at the top of that page.
   (If you don't see an Issuer ID, first create any key under **App Store Connect API** → **Team Keys**;
   then it appears.)

### 1.9 A sandbox tester (free test purchases)

1. **Users and Access** → **Sandbox** → **Test Accounts** → **+**.
2. Use an email address that has **never** been an Apple ID (e.g. `yourname+sandbox1@gmail.com`), any
   password, country **United States** (or Poland to see PLN prices) → **Create**.
3. Make a second one (`…+sandbox2@…`) to test referrals later.

TestFlight builds never charge real money. On the iPhone you can switch the sandbox account in
**Settings → App Store → Sandbox Account** (shown after you've installed a TestFlight build).

---

## Part 2: RevenueCat (app.revenuecat.com)

### 2.1 Project and app

1. Sign up (free until you earn $2.5k/month) → **Create new project** → name `Chosen`.
2. **Apps & providers** (older name: **Apps**) → **+ New** / **Add app** → **App Store**.
3. App name `Chosen iOS`, **Bundle ID** `com.chosencoach.app`.
4. **In-app purchase key configuration**: upload the `.p8` from 1.8, enter the **Issuer ID** → **Save changes**.
5. Still on this app's page, copy the **Apple Server Notification URL** (under *App Store Server
   Notifications*). In App Store Connect → your app → **App Information** → **App Store Server
   Notifications** → **Production Server URL**: paste, version **Version 2**; **Sandbox Server URL**: paste,
   version **Version 2** → **Save**. (Renewals and cancellations then reach RevenueCat within seconds.)

### 2.2 Products

**Product catalog** → **Products** → **+ New** (for the *Chosen iOS* app) and add all six product IDs from
the table at the top. (If you connected an App Store Connect API key, you can use **Import** instead.)

### 2.3 Entitlements (what each plan unlocks)

**Product catalog** → **Entitlements** → **+ New**:

1. Identifier **`pro`** (exactly, lowercase), description `Pro access` → **Add** → **Attach** products:
   `chosen_pro_monthly`, `chosen_pro_yearly`, **and** `chosen_elite_monthly`, `chosen_elite_yearly`
   (Elite includes everything in Pro).
2. Identifier **`elite`**, description `Elite access` → attach `chosen_elite_monthly`, `chosen_elite_yearly`.
3. Don't attach the two one-time products to any entitlement.

### 2.4 The offering (what the paywall shows)

**Product catalog** → **Offerings** → **+ New**: identifier `default`, description `Launch prices` → **Add**.
Inside it, **+ New package** four times. Choose **Custom** as the identifier and type it exactly:

| Package identifier | Product |
| --- | --- |
| `pro_monthly` | `chosen_pro_monthly` |
| `pro_yearly` | `chosen_pro_yearly` |
| `elite_monthly` | `chosen_elite_monthly` |
| `elite_yearly` | `chosen_elite_yearly` |

Then in the **Offerings** list open the **⋯** menu next to `default` → **Make current** (it must say *Current*).

Optional **Metadata** on the offering (JSON), to choose what's preselected without an app update:

```json
{ "default_plan": "pro", "default_period": "yearly" }
```

`default_plan` can be `pro` (default: shows "Start 3-day free trial") or `elite`. The app always
preselects Elite when the paywall is opened from an Elite-only feature, and for people who already have Pro.

The two one-time products don't need an offering: the app loads them by their product ID.

### 2.5 API keys

**Project settings** (gear) → **API keys**:

1. The **public app-specific key** for *Chosen iOS* starts with `appl_`. Copy it; it goes into the app
   (step 4.2). It's public by design, like the Supabase publishable key.
2. **+ New secret API key** → name `Supabase` → **API version: V1** → **Generate**. Copy the key
   (`sk_…`) right away. It goes **only** into Supabase (step 3.2), **never** into the app or `.env`.

### 2.6 Webhook (RevenueCat → our server)

1. Make up a long random password (e.g. 40 characters from your password manager, letters and digits only).
2. **Integrations** → **Webhooks** → **+ Add new configuration** (or **Add webhook**):
   - Name: `Supabase`
   - Webhook URL: `https://YOUR-PROJECT-REF.supabase.co/functions/v1/revenuecat-webhook`
     (your Project URL from SETUP-BACKEND step A4 + `/functions/v1/revenuecat-webhook`)
   - Authorization header value: `Bearer ` + your random password (e.g. `Bearer Xk29…`)
   - Environment: **Both production and sandbox** · App: **All apps** · Events: **All events**
3. **Save**. You'll send a test event in step 3.5.

---

## Part 3: Supabase

1. **SQL Editor** → **New query** → paste everything from
   `supabase/migrations/20261001120000_phase6_monetization.sql` → **Run** → *Success*.
2. **Edge Functions** → **Secrets** → **Add new secret** (twice):
   - `REVENUECAT_SECRET_KEY` = the `sk_…` key from 2.5
   - `REVENUECAT_WEBHOOK_AUTH` = your random password from 2.6 (**without** the word `Bearer`)
   - Optional, testing only: `REFERRAL_REWARDS_IN_SANDBOX` = `true` lets TestFlight purchases trigger
     referral rewards. **Delete it before launch.**
3. Deploy the two new functions (**Edge Functions → Deploy a new function → Via Editor**, exact name,
   paste the whole file, **Deploy**):

   | Name | File | Verify JWT |
   | --- | --- | --- |
   | `revenuecat-webhook` | `supabase/functions/revenuecat-webhook/index.ts` | **OFF** |
   | `sync-purchases` | `supabase/functions/sync-purchases/index.ts` | on |

   For `revenuecat-webhook`: after deploying, open the function → **Details** (or **Settings**) →
   switch **off** "Verify JWT" (called *Enforce JWT verification* in some versions) → **Save**.
   RevenueCat can't log in to Supabase; the function checks your webhook password instead.
4. Re-deploy two changed functions (open the function → **Code** → replace everything → **Deploy**):
   `coach-chat` (bought messages never expire now) and `delete-account` (also deletes the person's
   RevenueCat data).
5. Test the webhook: RevenueCat → **Integrations → Webhooks → Supabase** → **Send test event**. It should
   say it was delivered (status **200**). If you get **401**, the password in RevenueCat and in
   `REVENUECAT_WEBHOOK_AUTH` don't match. **"Invalid JWT"**: Verify JWT is still on.

---

## Part 4: Build the app for TestFlight (purchases don't work in Expo Go)

### 4.1 One-time EAS setup (skip what you've done for push notifications)

In PowerShell in `C:\Firma\APKA\chosen`:

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest init
```

### 4.2 Put the public keys into the cloud build

Cloud builds can't see your `.env` file, so add the values in Expo too:
**expo.dev** → your project **chosen** → **Environment variables** → **Add variable**, for each row
(Environments: tick **production**; Visibility: **Plain text**):

| Name | Value |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | same as in `.env` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | same as in `.env` |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | the `appl_…` key from 2.5 |

Also add `EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_…` to your local `.env` file.

### 4.3 Build and upload

```bash
npx eas-cli@latest build --platform ios --profile production
```

Log in with your Apple ID when asked and answer **Yes** to creating certificates and the bundle ID.
The build takes about 15–30 minutes in the cloud. Then:

```bash
npx eas-cli@latest submit --platform ios --latest
```

After Apple processes it (10–30 minutes), App Store Connect → your app → **TestFlight** → add yourself
under **Internal Testing** → install **TestFlight** on the iPhone → install Chosen.

### 4.4 Test every purchase (sandbox, no real money)

| Test | What should happen |
| --- | --- |
| Finish onboarding with a new account | Paywall appears after "Lock in". Yearly and Pro are preselected, "Start 3-day free trial". |
| Start the trial | Apple sheet says *Sandbox* → confirm → "Welcome to Pro!". Coach works. Profile: "Pro · Yearly · Free trial · ends …". Supabase → `profiles`: `tier = pro`, `subscription_is_trial = true`; `revenuecat_events`: rows with status `processed`. |
| Wait a few minutes | Sandbox time runs fast: a 3-day trial and each renewal take minutes, and sandbox subscriptions stop after a few renewals. `revenuecat_events` shows `RENEWAL`, later `EXPIRATION` → `tier` goes back to `free`. |
| Profile → Coach style → a locked style | Paywall with Elite preselected → **Upgrade to Elite** → `tier = elite`. |
| Machine (during the 30 days) → **Unlock Fast Pivot** | Buy → "Use Fast Pivot now" → confirm → the machine unlocks; the old hustle is `abandoned` in `user_hustles`. |
| Coach → use all messages (or set `messages_used` to 150 in `ai_usage` for this month) | "Get 100 more messages" → buy → `credits.bonus_messages = 100`. |
| Delete the app, reinstall, sign in → Profile → **Restore purchases** | "Purchases restored". |
| Referral: second sandbox tester + second account, enter the first account's code in the last onboarding question, subscribe (needs `REFERRAL_REWARDS_IN_SANDBOX=true`; the reward comes when the friend **pays**, i.e. after the trial converts) | Friend: +50 bonus messages. First account: 1 month of Pro (Profile: "Pro · Gift") or +100 messages if already subscribed. `referrals.status = rewarded`. |

---

## Part 5: Before you submit to the App Store

1. Replace the privacy policy placeholder in `src/config.ts` (`PRIVACY_URL`) with your real page, and
   paste the same link in App Store Connect → **App Privacy** → **Privacy Policy URL**.
2. The paywall links to Apple's standard **Terms of Use (EULA)**. Also add this line at the end of your
   App Store **Description**: `Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`
3. On the version page (**iOS App → 1.0**) → section **In-App Purchases and Subscriptions** → **Select**
   → tick all six products. The first products must be submitted together with an app version.
4. Add the review screenshots to the six products (1.4 step 4 and 1.7).
5. Delete the `REFERRAL_REWARDS_IN_SANDBOX` secret.
6. **App Review Information** → Notes, for example: `Subscriptions: Profile → See plans. Pro has a
   3-day free trial. Fast Pivot (consumable) is on the Machine screen during the 30-day commitment.
   100 coach messages (consumable) appear when the monthly coach limit is reached.`

---

## Changing prices or running A/B tests later (no app update)

- **New price for a product**: App Store Connect → the product → **Subscription Prices** → **Plan a Price
  Change**. You can keep existing subscribers on their old price.
- **Different prices for different people (A/B test)**:
  1. Create new products in App Store Connect in the **same group** (e.g. `chosen_pro_yearly_b` at $199.99).
     Keep `pro`/`elite` and `monthly`/`yearly` in the product IDs so the app recognizes them.
  2. RevenueCat: add the products, attach them to the entitlements like in 2.3, and make a second offering
     (e.g. `test_b`) with the same four package identifiers (`pro_monthly`, `pro_yearly`, …).
  3. RevenueCat → **Experiments** → **+ New** → Control: `default`, Treatment: `test_b` → **Start**.
  The app shows whichever offering RevenueCat picks for each person.

## Giving someone free access (yourself, a tester, a partner)

RevenueCat → **Customers** → search for the person's **user ID** (Supabase → Authentication → Users →
copy the *UID*) → **Entitlements** → **Grant** → `pro` or `elite` → duration → **Grant**. Our webhook
updates their plan within seconds. (Changing `profiles.tier` by SQL still works for quick tests, but the
next purchase event for that person overwrites it.)

## Referral rules (what the server does)

- A referral code can only be entered before subscribing (in onboarding).
- When the referred friend **starts paying** (trial converted, or bought without a trial), the friend gets
  **50 bonus messages**, and the person who invited them gets **1 month of Pro** (a RevenueCat promotional
  entitlement, added after any gifted month they already have) or **100 bonus messages** if they already
  pay for a subscription. Each referral is rewarded once.
- There are **no rewards of any kind** for App Store reviews or social media posts. The app only shows
  Apple's own rating prompt after a rank-up, the first logged revenue, or a finished roadmap, at most
  once every 90 days.

## If something doesn't work

| Problem | Fix |
| --- | --- |
| Paywall: "Couldn't load prices" | Paid Apps agreement not *Active*; a product still says *Missing Metadata*; bundle ID in RevenueCat ≠ `com.chosencoach.app`; the `default` offering isn't *Current*; new products can take up to an hour to appear. |
| Paywall: "Purchases aren't available here" | You're in Expo Go or the web preview (use TestFlight), or `EXPO_PUBLIC_REVENUECAT_IOS_KEY` is missing in the EAS environment variables. |
| Paid, but the app still says Free | Supabase → **Table Editor → revenuecat_events**: a row with status `failed` shows the reason in `note`. Check both secrets from 3.2, then tap **Profile → Restore purchases**. Function logs: **Edge Functions → revenuecat-webhook → Logs**. |
| Webhook test gives 401 / 503 | 401: the passwords don't match. 503 `not_configured`: `REVENUECAT_WEBHOOK_AUTH` secret missing. |
| Trial button doesn't appear | That Apple ID already used the Pro trial (correct behavior). Use a new sandbox tester. |

### Optional: try the paywall in Expo Go

RevenueCat has a **Test Store** for trying purchases without Apple. RevenueCat → **Apps & providers** →
**+ New** → **Test Store** → copy its key (starts with `test_`) into `.env` as
`EXPO_PUBLIC_REVENUECAT_TEST_KEY`, add the same product IDs to the Test Store app and to the packages
in your offering. This is optional and wasn't part of our tests; TestFlight is the reliable way.
