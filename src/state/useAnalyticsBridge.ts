import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { ONBOARDING_STEPS, screenName, setAnalyticsConsent, track, trackScreen } from '@/lib/analytics';

import { useAccount } from './AccountProvider';
import { useApp } from './AppState';

/**
 * Connects analytics to the app (used once, in the root layout):
 *  • applies the user's analytics choice from their profile
 *  • screen views, onboarding steps and app_opened
 */
export function useAnalyticsBridge(ready: boolean) {
  const { userId, profile } = useAccount();
  const { state } = useApp();
  const pathname = usePathname();

  // Consent + identity. Unknown until the profile is loaded.
  const consent = userId ? (profile ? profile.analytics_consent : null) : null;
  const tier = profile?.tier ?? null;
  const locale = profile?.locale ?? null;
  const country = profile?.country ?? null;
  const pushOn = !!profile?.expo_push_token;
  const promoOn = profile?.promo_push_opt_in ?? false;
  const aiOn = !!profile?.ai_consent_at;
  useEffect(() => {
    if (!ready) return;
    setAnalyticsConsent(consent, userId, { tier, locale, country, push_enabled: pushOn, promo_opt_in: promoOn, ai_consent: aiOn });
  }, [ready, consent, userId, tier, locale, country, pushOn, promoOn, aiOn]);

  // Screens and onboarding steps.
  const onboardingDone = state.onboardingCompleted;
  useEffect(() => {
    if (!ready || !pathname) return;
    const name = screenName(pathname);
    trackScreen(name);
    const step = ONBOARDING_STEPS[name];
    if (step && !onboardingDone) {
      const question = name === '/quiz/[step]' ? Number(pathname.split('/').pop()) || null : null;
      track('onboarding_step_viewed', { step: name.replace(/^\//, ''), step_index: step, question });
    }
  }, [ready, pathname, onboardingDone]);

  // App opened: at launch, and when coming back from the background.
  const launched = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (!launched.current) {
      launched.current = true;
      track('app_opened', { cold_start: true });
    }
    let previous = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (previous.match(/inactive|background/) && next === 'active') track('app_opened', { cold_start: false });
      previous = next;
    });
    return () => sub.remove();
  }, [ready]);
}
