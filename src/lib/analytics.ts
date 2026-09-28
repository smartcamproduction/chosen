import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import PostHog from 'posthog-react-native';

/**
 * Product analytics with PostHog (EU cloud, data stays in the EU).
 *
 * Privacy rules:
 *  • Nothing is sent unless the user switched on "Anonymous analytics"
 *    (profiles.analytics_consent). Until we know their choice (e.g. before
 *    sign-in), events wait in memory only, for this app session, and are
 *    sent only if they say yes. If they say no, they're thrown away.
 *  • People are identified by their Supabase user id only: never their
 *    email or name. No GeoIP location. No money amounts.
 *  • Session replay (iPhone app builds only) masks every text input and
 *    image, so answers, messages and screenshots are never recorded.
 *
 * Setup: EXPO_PUBLIC_POSTHOG_KEY in .env (see docs/SETUP-ANALYTICS.md).
 * Without it, analytics is simply off.
 */

export type AnalyticsEvent =
  | 'app_opened'
  | 'onboarding_step_viewed'
  | 'onboarding_completed'
  | 'spin'
  | 'spin_result'
  | 'hustle_chosen'
  | 'sign_in'
  | 'quiz_completed'
  | 'paywall_viewed'
  | 'trial_started'
  | 'purchase'
  | 'restore'
  | 'step_completed'
  | 'checkin_submitted'
  | 'coach_message_sent'
  | 'coach_limit_reached'
  | 'share_card_created'
  | 'share_completed'
  | 'referral_code_entered'
  | 'fast_pivot_used'
  | 'notification_opened'
  | 'account_deleted';

type Value = string | number | boolean | null;
export type EventProps = Record<string, Value>;

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';
/** Events kept in memory while consent is unknown (never written to disk). */
const MAX_WAITING = 100;

let client: PostHog | null = null;
/** null = not known yet (signed out, profile loading). */
let consent: boolean | null = null;
let identifiedAs: string | null = null;
let waiting: { event: string; props?: EventProps; at: Date; screen?: boolean }[] = [];

export const analyticsConfigured = KEY.startsWith('phc_');

function getClient(): PostHog | null {
  if (!analyticsConfigured) return null;
  if (!client) {
    const replay = Platform.OS !== 'web' && !isRunningInExpoGo();
    client = new PostHog(KEY, {
      host: HOST,
      // Our own app_opened is enough; no automatic lifecycle events.
      captureAppLifecycleEvents: false,
      // Only people who signed in and agreed get a person profile.
      personProfiles: 'identified_only',
      disableGeoip: true,
      enableSessionReplay: replay,
      sessionReplayConfig: {
        maskAllTextInputs: true,
        maskAllImages: true,
        maskAllSandboxedViews: true,
        captureLog: false,
        captureNetworkTelemetry: false,
      },
      // No crash reports: they'd need their own privacy label entry.
      errorTracking: { autocapture: false },
    });
    client.register({ app_env: __DEV__ ? 'development' : 'production' }).catch(() => {});
  }
  return client;
}

function send(event: string, props: EventProps | undefined, at: Date, screen = false) {
  const ph = getClient();
  if (!ph) return;
  if (screen) ph.screen(event, props, { timestamp: at }).catch(() => {});
  else ph.capture(event, props, { timestamp: at });
}

/** Records an event (only sent with consent; see the rules above). */
export function track(event: AnalyticsEvent, props?: EventProps): void {
  if (!analyticsConfigured || consent === false) return;
  if (consent === null) {
    if (waiting.length < MAX_WAITING) waiting.push({ event, props, at: new Date() });
    return;
  }
  send(event, props, new Date());
}

/** A screen view (route like "/today" or "/task/[id]"). */
export function trackScreen(route: string): void {
  if (!analyticsConfigured || consent === false) return;
  if (consent === null) {
    if (waiting.length < MAX_WAITING) waiting.push({ event: route, at: new Date(), screen: true });
    return;
  }
  send(route, undefined, new Date(), true);
}

/**
 * The user's choice, as saved on their profile. true → send what waited and
 * identify them; false → drop everything and stop; null → unknown (wait).
 */
export function setAnalyticsConsent(granted: boolean | null, userId: string | null, person?: EventProps): void {
  if (!analyticsConfigured) return;
  consent = granted;
  if (granted === false) {
    waiting = [];
    if (client) {
      client.optOut().catch(() => {});
      client.reset();
      identifiedAs = null;
    }
    return;
  }
  if (granted === null) return;

  const ph = getClient();
  if (!ph) return;
  ph.optIn().catch(() => {});
  if (userId && identifiedAs !== userId) {
    ph.identify(userId, person);
    identifiedAs = userId;
  } else if (userId && person) {
    ph.setPersonProperties(person);
  }
  const queued = waiting;
  waiting = [];
  for (const w of queued) send(w.event, w.props, w.at, w.screen);
}

/** Sign-out / account deletion: forget who this device belonged to. */
export async function resetAnalytics(): Promise<void> {
  waiting = [];
  consent = null;
  identifiedAs = null;
  if (!client) return;
  await client.flush().catch(() => {});
  client.reset();
}

/** Sends everything now (e.g. right before the account is deleted). */
export async function flushAnalytics(): Promise<void> {
  if (client) await client.flush().catch(() => {});
}

/** Routes with ids collapse to one name, e.g. /task/p1s3 → /task/[id]. */
export function screenName(pathname: string): string {
  return pathname.replace(/^\/task\/[^/]+$/, '/task/[id]').replace(/^\/quiz\/\d+$/, '/quiz/[step]') || '/';
}

/** Onboarding screens, in order (for the onboarding funnel). */
export const ONBOARDING_STEPS: Record<string, number> = {
  '/welcome': 1,
  '/draw': 2,
  '/sign-in': 3,
  '/age': 4,
  '/consent': 5,
  '/quiz/[step]': 6,
  '/commit': 7,
};
