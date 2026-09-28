# App Store checklist

Everything App Store Connect asks for, in order, with the exact answers for Chosen. Do this after
[SETUP-BACKEND.md](SETUP-BACKEND.md), [SETUP-PAYMENTS.md](SETUP-PAYMENTS.md) and
[SETUP-ANALYTICS.md](SETUP-ANALYTICS.md).

## 0. Replace the placeholders first

| Where | What | Status |
| --- | --- | --- |
| `src/config.ts` | `WEBSITE_URL`, `TERMS_URL`, `PRIVACY_URL`, `SUPPORT_EMAIL` | **Placeholders**: your real website and email |
| `src/config.ts` | `INVITE_BASE_URL` (share-card QR code) | **Placeholder** |
| `src/data/roadmaps/affiliate-links.json` | Affiliate links | **Placeholders** (or remove the affiliate flag) |
| Your website | Terms of Use and Privacy Policy pages | Drafts in `docs/legal/`: fill in the [BRACKETS], have a lawyer check them, publish |
| `supabase/demo/demo-account.sql` | Demo email, if you don't use `appreview@chosen.app` | Change `v_email` |

Then build a new version: `npx eas-cli@latest build --platform ios --profile production` and
`npx eas-cli@latest submit --platform ios --latest` (see SETUP-PAYMENTS.md Part 4).

---

## 1. App information (App Store Connect → your app → App Information)

- **Name**: `Chosen: Side Hustle Coach` (25 of 30 characters)
- **Subtitle** (30 max): `Pick a hustle. Follow the plan` (30) · Polish: `Wylosuj biznes. Trzymaj plan` (28)
- **Category**: Primary **Productivity**, Secondary **Business**
- **Content rights**: "Does your app contain, show, or access third-party content?" → **Yes** (AI-generated coaching
  text and links to third-party tools). You have the rights to show them.
- **Privacy Policy URL**: your `PRIVACY_URL`
- **App Store Server Notifications**: set in SETUP-PAYMENTS.md step 2.1.5
- **Localizations**: add **Polish** (name can stay the same; subtitle above)

## 2. Age rating: 18+

App Information → **Age Rating** → **Edit**. Answer honestly; the content itself rates low, then use the
override to set 18+ (our Terms require users to be 18, and it's about money decisions).

| Question | Answer |
| --- | --- |
| Violence (cartoon, realistic, prolonged, horror…) | None |
| Sexual content, nudity | None |
| Profanity or crude humor | None |
| Alcohol, tobacco or drug use | None |
| Mature or suggestive themes | None |
| Medical or treatment information / Health & wellness | None |
| **Simulated gambling** | **None**. The machine is a free random idea picker: nothing is wagered, nothing can be won, no odds, no currency. (If Apple disagrees, choose "Infrequent"; it changes nothing because the app is 18+ anyway.) |
| Gambling (real money) | No |
| Contests | None |
| Unrestricted web access | No (links open specific pages in an in-app browser; there's no address bar to browse anywhere) |
| User-generated content (shared with other users) | No (check-ins and coach chats are private) |
| Messaging and chat (with other people) | No (the chat is with an AI, not with other users) |
| Advertising | No |
| Parental controls | No |
| Age assurance | Only if the question allows self-declaration: we ask for the date of birth and block under-18s. Otherwise No. |

Then **Age Rating Override** → choose **18+** → reason: "Our Terms of Use require users to be 18 or older; the
app is about starting a business and money decisions." → **Done**.

## 3. App Privacy (the "nutrition labels")

App Store Connect → **App Privacy** → **Get Started** → "Do you or your third-party partners collect data from
this app?" → **Yes**. Select exactly these data types, then answer the three questions for each.

| Data type | Why (purposes) | Linked to the user? | Used for tracking? |
| --- | --- | --- | --- |
| Contact Info → **Email Address** | App Functionality | Yes | No |
| Contact Info → **Name** | App Functionality | Yes | No |
| Financial Info → **Other Financial Info** (revenue and costs typed into check-ins) | App Functionality | Yes | No |
| User Content → **Photos or Videos** (screenshots attached to check-ins and coach messages) | App Functionality | Yes | No |
| User Content → **Other User Content** (quiz answers, check-in notes, coach messages) | App Functionality, Product Personalization | Yes | No |
| Location → **Coarse Location** (country from the phone's region settings, for "Top X% in your country") | App Functionality | Yes | No |
| Identifiers → **User ID** | App Functionality, Analytics | Yes | No |
| Identifiers → **Device ID** (push notification token) | App Functionality, Developer's Advertising or Marketing (the optional "Offers & news" notifications) | Yes | No |
| Purchases → **Purchase History** | App Functionality, Analytics | Yes | No |
| Usage Data → **Product Interaction** (analytics events and masked session replays, only with consent) | Analytics | Yes | No |

**Not collected** (leave unchecked): Health & Fitness, Payment Info, Credit Info, Precise Location, Sensitive
Info, Contacts, Emails or Text Messages, Audio, Gameplay Content, Customer Support, Browsing History, Search
History, Advertising Data, Other Usage Data, Crash Data, Performance Data, Other Diagnostic Data, Other Data.

**Tracking** (the "Used for tracking" column): **No** everywhere. We don't link data with other companies'
data for advertising and don't share it with data brokers, so no App Tracking Transparency prompt is needed.

Why "linked": everything is stored with the account (analytics uses the Supabase user ID).

## 4. Screenshots

Only iPhone is needed (the app doesn't run on iPad: `supportsTablet` is false).

- **Required size: 6.9-inch**, portrait **1320 × 2868** (also accepted: 1290 × 2796, 1260 × 2736).
- If you can't make 6.9-inch images, Apple accepts **6.5-inch** instead: 1284 × 2778 or 1242 × 2688.
- 1 to 10 images, PNG or JPEG, **no transparency**. Upload them for English and Polish.
- How: take screenshots on an iPhone Pro Max from the TestFlight build (they come out at exactly 1320 × 2868
  on 16/17 Pro Max), or put your screenshots into frames in Figma/Canva at 1320 × 2868.

Suggested order (each with one short headline on top):
1. The machine spinning: "Let fate pick your side hustle"
2. Result + commitment: "Commit for 30 days"
3. Today with the next step: "One clear step every day"
4. Roadmap: "A 12-week plan made for you"
5. AI coach chat: "A coach that knows your numbers"
6. Progress with rank and streak: "Watch your profit grow"
7. Paywall (optional)

Don't put income promises in screenshots or the description (e.g. "make $5,000 a month"): Apple rejects
misleading claims. The app says it everywhere: *Not financial advice. Results vary and are not guaranteed.*

## 5. Description and keywords

- **Keywords** (100 max, comma-separated, no spaces after commas; 98 used):
  `side hustle,business ideas,ai coach,planner,goals,habit,freelance,newsletter,budget,income tracker`
  Never put brand or other apps' names in keywords (Etsy, Shopify…): Apple rejects that.
- **Description**: what it does, then the subscription details. End with:
  `Not financial advice. Results vary and are not guaranteed.`
  `Terms of Use: <your TERMS_URL>` and `Privacy Policy: <your PRIVACY_URL>`
  (Apple wants the Terms link in the description or the EULA field for apps with subscriptions.)
- **Support URL**: your website (a page with your support email). **Marketing URL**: your website.
- **Copyright**: `2026 <your company name>`

## 6. Demo account for Apple reviewers

Sign in with Apple works for reviewers, but a ready account saves them the whole onboarding and shows a
lived-in app.

1. Supabase → **Authentication** → **Sign In / Providers** → **Email** → switch it **on** (needed for the
   email sign-in). Leave "Confirm email" on.
2. Supabase → **Authentication** → **Users** → **Add user** → **Create new user**: email
   `appreview@chosen.app` (or your own), a strong password, tick **Auto Confirm User** → **Create user**.
3. **SQL Editor** → paste `supabase/demo/demo-account.sql` → **Run**. The account is now 10 days into the
   Newsletter hustle, with steps done and one check-in, on the Free plan (so reviewers can test the paywall;
   sandbox purchases are free for them).
4. Test it yourself: in the app, **Sign in with email** (under the Apple/Google buttons) → the email and
   password → you land on Today.
5. Re-run the SQL before each submission to reset the account.

In App Store Connect → the version → **App Review Information**: tick **Sign-in required**, enter the email
and password, and your contact details.

## 7. Review notes (copy and paste, adjust the email)

```
Chosen is a coaching app for adults (18+) who want to start a side hustle.

NO GAMBLING: The "machine" on the first screens only looks like a slot machine. It is a free, unlimited
random picker that suggests one of 15 legal online side-hustle ideas. Nothing is wagered or paid to
spin, there are no prizes, odds, coins, tokens or virtual currency, and nothing of value can be won.
After a spin the user can commit to the suggested idea for 30 days and follow a step-by-step plan.

DEMO ACCOUNT: tap "Sign in with email" below the Apple/Google buttons on the sign-in screen and use the
credentials above. The account has finished onboarding and is on the Free plan. Sign in with Apple
also works.

SUBSCRIPTIONS: Profile > See plans (or open the Coach tab). Pro monthly/yearly include a 3-day free
trial; Elite has none. Restore Purchases, Terms and Privacy links are on the paywall.
ONE-TIME PURCHASES: "Fast Pivot" (Machine screen, during the 30-day commitment) lets the user switch
ideas early; "100 coach messages" appears when the monthly AI message limit is reached.

AI: The coach uses Claude by Anthropic. Data is only sent after the user agrees on the consent screen,
and it can be switched off in Profile > Privacy & legal (the coach then stops).
ACCOUNT DELETION: Profile > Delete account & data (deletes everything on our servers).
Not financial advice; the app never promises earnings.
```

## 8. Other questions App Store Connect asks

- **Export compliance**: answered in the app (`ITSAppUsesNonExemptEncryption: false`, we only use standard
  HTTPS). No documents needed.
- **Advertising identifier (IDFA)**: No.
- **Sign in with Apple**: included (required because Google sign-in is offered).
- **In-App Purchases**: select all six on the version page (SETUP-PAYMENTS.md Part 5).
- **Permissions shown to users**: notifications (asked after an explanation screen, right after choosing a
  hustle) and photos (only when attaching screenshots). Both texts exist in English and Polish.
- **Account deletion**: in the app (Profile → Delete account & data). Apple requires this.
- **Data export**: Profile → Download my data (JSON file).

## 9. Final test before you press Submit

On the TestFlight build:

- [ ] New account → age check → consent → questions → spin → lock in → notification explanation → paywall.
- [ ] Trial purchase in sandbox → Coach works → Profile shows the trial end date.
- [ ] Restore purchases after reinstalling.
- [ ] Fast Pivot purchase and use; 100 messages purchase.
- [ ] Airplane mode: the app opens with your data and shows "You're offline"; nothing crashes.
- [ ] iPhone Settings → Accessibility → Larger Text at the biggest size: screens are readable and scroll.
- [ ] VoiceOver on: buttons and switches are read with their names.
- [ ] Profile → Terms / Privacy open your website pages (not a 404).
- [ ] Profile → Delete account works (use a throwaway account).
- [ ] The demo account signs in.
