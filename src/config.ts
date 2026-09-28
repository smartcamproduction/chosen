/**
 * App-wide settings you may want to change.
 *
 * INVITE_BASE_URL: where the QR code on share cards and the "Copy invite
 * link" button point. It's a placeholder until you have a website or
 * App Store link. Replace it with your real page (for example a landing
 * page that redirects to the App Store and remembers the referral code).
 */
export const INVITE_BASE_URL = 'https://chosen.app/invite';

export function inviteUrl(referralCode?: string | null): string {
  return referralCode ? `${INVITE_BASE_URL}/${encodeURIComponent(referralCode)}` : INVITE_BASE_URL;
}

/**
 * YOUR WEBSITE. PLACEHOLDERS: replace all four with your real addresses
 * before you submit to the App Store (Apple opens these links in review).
 *   WEBSITE_URL   – your homepage (also App Store Connect → Marketing URL)
 *   TERMS_URL     – your Terms of Use page. It must cover the subscriptions
 *                   (or link to Apple's standard EULA, APPLE_EULA_URL)
 *   PRIVACY_URL   – your Privacy Policy page (also App Store Connect →
 *                   App Privacy → Privacy Policy URL)
 *   SUPPORT_EMAIL – where people (and Apple) can reach you
 * Drafts of both documents: docs/legal/ (have a lawyer check them).
 */
export const WEBSITE_URL = 'https://chosen.app';
export const TERMS_URL = `${WEBSITE_URL}/terms`;
export const PRIVACY_URL = `${WEBSITE_URL}/privacy`;
export const SUPPORT_EMAIL = 'support@chosen.app';

/** Apple's standard Terms of Use for apps (EULA). */
export const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/** Anthropic (Claude), the AI coach's provider. */
export const ANTHROPIC_PRIVACY_URL = 'https://www.anthropic.com/legal/privacy';

/**
 * RevenueCat public SDK keys, from the `.env` file (see `.env.example`).
 * These are public by design (like the Supabase anon key): they can only
 * show prices and start a purchase for the signed-in user. The secret
 * RevenueCat key lives only in Supabase (Edge Function secrets).
 *   ios     – starts with appl_
 *   android – starts with goog_ (later)
 *   test    – optional, starts with test_: RevenueCat's Test Store, lets
 *             you try purchases in Expo Go without the App Store.
 */
export const REVENUECAT_KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
  test: process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY ?? '',
};
