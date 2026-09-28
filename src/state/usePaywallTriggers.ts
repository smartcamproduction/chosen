import { router } from 'expo-router';
import { Platform } from 'react-native';

import { track } from '@/lib/analytics';
import { pushPermission } from '@/lib/notifications';
import { openPaywall } from '@/lib/paywall';

import { useAccount } from './AccountProvider';
import { useApp } from './AppState';
import { useTier } from './hooks';

/**
 * After a hustle was locked in: go to Today, then (once per device)
 *  1. explain notifications and ask for permission (/push-intro), if the
 *     iPhone hasn't been asked yet
 *  2. the paywall for Free users at the end of onboarding
 */
export function useAfterHustleChosen() {
  const { state, update } = useApp();
  const { profile } = useAccount();
  const tier = useTier();

  return async (hustleSlug?: string) => {
    router.replace('/today');

    if (!state.onboardingCompleted) {
      update({ onboardingCompleted: true });
      track('onboarding_completed', { hustle: hustleSlug ?? null, tier });
    }

    const showPaywall = tier === 'free' && !state.onboardingPaywallShown;
    if (showPaywall) update({ onboardingPaywallShown: true });

    const askPush =
      Platform.OS !== 'web' && !profile?.expo_push_token && !state.pushAskedAt && (await pushPermission()) === 'undetermined';

    // Let Today appear first, then slide the next screen up.
    setTimeout(() => {
      if (askPush) router.push({ pathname: '/push-intro', params: showPaywall ? { then: 'paywall' } : {} });
      else if (showPaywall) openPaywall('onboarding');
    }, 400);
  };
}
