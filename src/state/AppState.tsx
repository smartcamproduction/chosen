import { getLocales } from 'expo-localization';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { QuizDraft } from '@/data/quiz';
import type { Tier } from '@/lib/database.types';
import type { Currency } from '@/lib/format';
import { loadJSON, saveJSON, StorageKeys } from '@/lib/storage';

/**
 * Device-level state (saved on this phone only).
 * Account data (plan, quiz answers, consents, committed hustle) lives in
 * Supabase — see src/state/AccountProvider.tsx.
 */

export type { Tier };

export interface AppStateShape {
  haptics: boolean;
  /** Machine sounds before sign-in (after sign-in profiles.sounds_enabled wins). */
  sounds: boolean;
  /** Money display before sign-in (after sign-in the profile currency wins). */
  currency: Currency;
  /** Hustle the machine drew, waiting for "Choose this". */
  pendingHustleId: string | null;
  spinCount: number;
  /** Quiz answers while the user is still going through the questions. */
  quizDraft: QuizDraft;
  /** Set when someone under 18 tried to sign up on this device. */
  ageBlocked: boolean;
  /** Developer preview only: pretend to be on another plan. */
  devTier: Tier | null;
  /** The paywall at the end of onboarding was shown on this device. */
  onboardingPaywallShown: boolean;
  /** The first hustle was locked in on this device (analytics: onboarding_completed). */
  onboardingCompleted: boolean;
  /** When we last showed the "turn on notifications" explanation (ISO date). */
  pushAskedAt: string | null;
}

const SUPPORTED_CURRENCIES: Currency[] = ['USD', 'EUR', 'PLN', 'GBP'];

function deviceCurrency(): Currency {
  try {
    const code = getLocales()[0]?.currencyCode as Currency | null | undefined;
    if (code && SUPPORTED_CURRENCIES.includes(code)) return code;
    return getLocales()[0]?.regionCode === 'PL' ? 'PLN' : 'USD';
  } catch {
    return 'USD';
  }
}

const DEFAULT_STATE: AppStateShape = {
  haptics: true,
  sounds: true,
  currency: deviceCurrency(),
  pendingHustleId: null,
  spinCount: 0,
  quizDraft: {},
  ageBlocked: false,
  devTier: null,
  onboardingPaywallShown: false,
  onboardingCompleted: false,
  pushAskedAt: null,
};

interface AppContextValue {
  state: AppStateShape;
  ready: boolean;
  /** Pass an object, or a function of the latest state (safe for rapid taps). */
  update: (patch: Partial<AppStateShape> | ((prev: AppStateShape) => Partial<AppStateShape>)) => void;
  /** Clears onboarding progress (keeps device preferences). */
  resetOnboarding: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppStateShape>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadJSON<Partial<AppStateShape>>(StorageKeys.app).then((saved) => {
      if (saved) {
        // Only keep keys this version knows about.
        const known = Object.fromEntries(Object.entries(saved).filter(([k]) => k in DEFAULT_STATE));
        setState({ ...DEFAULT_STATE, ...known });
      }
      setReady(true);
    });
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      ready,
      update: (patch) => {
        setState((prev) => {
          const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
          saveJSON(StorageKeys.app, next);
          return next;
        });
      },
      resetOnboarding: () => {
        setState((prev) => {
          const next: AppStateShape = {
            ...DEFAULT_STATE,
            haptics: prev.haptics,
            sounds: prev.sounds,
            currency: prev.currency,
            devTier: prev.devTier,
            ageBlocked: prev.ageBlocked,
          };
          saveJSON(StorageKeys.app, next);
          return next;
        });
      },
    }),
    [state, ready],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider');
  return ctx;
}

export const isPremium = (tier: Tier) => tier !== 'free';
