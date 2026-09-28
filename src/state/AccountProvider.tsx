import type { Session } from '@supabase/supabase-js';
import { getCalendars, getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import i18n from '@/i18n';
import { flushAnalytics, resetAnalytics, track } from '@/lib/analytics';
import { deleteAccountOnServer, signInWithApple, signInWithGoogle, type AuthOutcome } from '@/lib/auth';
import type { ProfileRow, ProfileUpdate, Tier, UserHustleRow } from '@/lib/database.types';
import { awardBadges, EMPTY_PROGRESS, type PreviewProgress } from '@/lib/previewEngine';
import { loadJSON, removeKey, saveJSON } from '@/lib/storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/**
 * The signed-in user's account: session, profile row, committed hustles and
 * Fast Pivot credits.
 *
 * Two modes:
 *  • "supabase" — the real backend (keys in .env).
 *  • "preview"  — backend not connected yet: sign-in is simulated and the
 *                 account is kept on this device, so every screen still works.
 */

export interface AccountSnapshot {
  profile: ProfileRow | null;
  userHustles: UserHustleRow[];
  fastPivotCredits: number;
  /** Extra coach messages (bought or referral rewards). */
  bonusMessages: number;
}

const EMPTY_SNAPSHOT: AccountSnapshot = { profile: null, userHustles: [], fastPivotCredits: 0, bonusMessages: 0 };

export type SignInResult = { ok: true; snapshot: AccountSnapshot } | { ok: false; cancelled?: boolean; error: string };
export type ActionResult = { ok: true } | { ok: false; error: string };

export type ChooseError =
  | 'locked'
  | 'no_credits'
  | 'confirm_required'
  | 'age_not_confirmed'
  | 'elite_required'
  | 'hustle_not_available'
  | 'offline'
  | 'unknown';

export type PivotError = 'no_credits' | 'not_locked' | 'no_active_hustle' | 'offline' | 'unknown';

export interface ChooseOptions {
  slot?: 1 | 2;
  /** Spend a Fast Pivot credit to switch before the 30 days are over. */
  useFastPivot?: boolean;
  /** The user confirmed ending the current hustle in this slot. */
  replaceCurrent?: boolean;
}

interface AccountContextValue {
  mode: 'supabase' | 'preview';
  /** Session restored and (if signed in) profile loaded. */
  ready: boolean;
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  profile: ProfileRow | null;
  userHustles: UserHustleRow[];
  fastPivotCredits: number;
  bonusMessages: number;
  /** Showing the copy from the last visit because the server can't be reached. */
  offline: boolean;
  /** Signed in, but the account couldn't be loaded and there's no saved copy. */
  loadFailed: boolean;
  retryLoad: () => void;
  signIn: (provider: 'apple' | 'google') => Promise<SignInResult>;
  /** Email + password (existing accounts only, e.g. the App Review demo account). */
  signInWithEmail: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<ActionResult>;
  updateProfile: (patch: ProfileUpdate) => Promise<{ ok: true; profile: ProfileRow } | { ok: false; error: string }>;
  chooseHustle: (hustleId: string, options?: ChooseOptions) => Promise<{ ok: true } | { ok: false; error: ChooseError }>;
  /**
   * Fast Pivot: spends one credit, leaves the current (locked) hustle in
   * this slot and frees it, so the user can choose again right away.
   */
  activateFastPivot: (slot?: 1 | 2) => Promise<{ ok: true; left: number } | { ok: false; error: PivotError }>;
  redeemReferral: (code: string) => Promise<boolean>;
  refresh: () => Promise<AccountSnapshot>;
  /** Preview mode only: helpers to test Fast Pivot, check-ins, the end of the 30 days and (simulated) purchases. */
  previewTools: {
    addFastPivotCredit: () => void;
    addBonusMessages: (count: number) => void;
    setPlan: (tier: Tier) => void;
    endCommitmentNow: () => void;
    skipWeek: () => void;
  } | null;
  /** Preview mode only: the whole on-device account (used by ProgressProvider). */
  preview: { data: PreviewAccount; update: (next: PreviewAccount | ((prev: PreviewAccount) => PreviewAccount)) => void } | null;
}

const AccountContext = createContext<AccountContextValue | null>(null);

const PREVIEW_KEY = 'chosen.preview.account';
/** Bump when the saved preview account changes shape. */
const PREVIEW_VERSION = 2;
const DAY_MS = 86_400_000;

export interface PreviewAccount {
  version: number;
  signedIn: boolean;
  profile: ProfileRow | null;
  userHustles: UserHustleRow[];
  fastPivotCredits: number;
  /** Simulated "100 more messages" purchases (Phase 6). */
  bonusMessages: number;
  /** Steps, check-ins, badges and active days (Phase 4). */
  progress: PreviewProgress;
}

const EMPTY_PREVIEW: PreviewAccount = {
  version: PREVIEW_VERSION,
  signedIn: false,
  profile: null,
  userHustles: [],
  fastPivotCredits: 0,
  bonusMessages: 0,
  progress: EMPTY_PROGRESS,
};

/** Fields added to the profile after the preview account was saved. */
const PROFILE_DEFAULTS: Pick<
  ProfileRow,
  | 'subscription_product'
  | 'subscription_store'
  | 'subscription_expires_at'
  | 'subscription_will_renew'
  | 'subscription_is_trial'
  | 'subscription_is_promo'
  | 'subscription_synced_at'
  | 'analytics_consent_at'
  | 'promo_push_opt_in'
  | 'promo_push_opt_in_at'
> = {
  subscription_product: null,
  subscription_store: null,
  subscription_expires_at: null,
  subscription_will_renew: null,
  subscription_is_trial: false,
  subscription_is_promo: false,
  subscription_synced_at: null,
  analytics_consent_at: null,
  promo_push_opt_in: false,
  promo_push_opt_in_at: null,
};

/** Older preview accounts had sample XP/rank numbers; start them fresh. */
function migratePreview(saved: Partial<PreviewAccount>): PreviewAccount {
  if (saved.version === PREVIEW_VERSION) {
    return { ...EMPTY_PREVIEW, ...saved, profile: saved.profile ? { ...PROFILE_DEFAULTS, ...saved.profile } : null };
  }
  return {
    ...EMPTY_PREVIEW,
    signedIn: saved.signedIn ?? false,
    fastPivotCredits: saved.fastPivotCredits ?? 0,
    profile: saved.profile
      ? { ...PROFILE_DEFAULTS, ...saved.profile, xp: 0, level: 0, rank: 'rookie', streak_current: 0, streak_best: 0, last_active_date: null, timezone: null }
      : null,
    userHustles: (saved.userHustles ?? []).map((u) => ({
      ...u,
      completed_at: u.completed_at ?? null,
      personalization_status: null,
      personalization_error: null,
      personalization_started_at: null,
      personalized_at: null,
    })),
  };
}

function deviceTimeZone(): string | null {
  try {
    return getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

function previewProfile(): ProfileRow {
  return {
    id: 'preview-user',
    display_name: 'Alex Vane',
    locale: null,
    country: null,
    currency: 'USD',
    age_confirmed_at: null,
    ai_consent_at: null,
    analytics_consent: false,
    quiz: null,
    tier: 'free',
    coach_personality: 'balanced',
    xp: 0,
    level: 0,
    rank: 'rookie',
    streak_current: 0,
    streak_best: 0,
    last_active_date: null,
    timezone: deviceTimeZone(),
    notification_time: null,
    expo_push_token: null,
    sounds_enabled: true,
    referral_code: 'PREVIEW1',
    referred_by: null,
    is_admin: false,
    created_at: new Date().toISOString(),
    ...PROFILE_DEFAULTS,
  };
}

function deviceCountry(): string | null {
  try {
    const region = getLocales()[0]?.regionCode;
    return region && /^[A-Z]{2}$/.test(region) ? region : null;
  } catch {
    return null;
  }
}

/** Reads the user's profile, active hustles and credits (Fast Pivots, bonus messages). */
async function loadAccountRows(uid: string): Promise<AccountSnapshot> {
  if (!supabase) return EMPTY_SNAPSHOT;
  const [profileRes, hustlesRes, creditsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
    supabase.from('user_hustles').select('*').eq('user_id', uid).eq('status', 'active').order('slot'),
    supabase.from('credits').select('*').eq('user_id', uid).maybeSingle(),
  ]);
  // A network error must not look like "this user has no profile".
  const error = profileRes.error ?? hustlesRes.error ?? creditsRes.error;
  if (error) throw error;
  return {
    profile: profileRes.data ?? null,
    userHustles: hustlesRes.data ?? [],
    fastPivotCredits: creditsRes.data?.fast_pivot_credits ?? 0,
    bonusMessages: creditsRes.data?.bonus_messages ?? 0,
  };
}

/** The last account data seen on this device, for opening the app offline. */
const accountCacheKey = (uid: string) => `chosen.cache.account.${uid}`;

const isNewAccount = (profile: ProfileRow | null) => !profile?.age_confirmed_at || !profile?.quiz;

function mapPivotError(message: string): PivotError {
  if (message.includes('no_fast_pivot_credits')) return 'no_credits';
  if (message.includes('not_locked')) return 'not_locked';
  if (message.includes('no_active_hustle')) return 'no_active_hustle';
  if (/network|fetch|timeout/i.test(message)) return 'offline';
  return 'unknown';
}

function mapChooseError(message: string): ChooseError {
  if (message.includes('no_fast_pivot_credits')) return 'no_credits';
  if (message.includes('confirm_replace_required')) return 'confirm_required';
  if (message.includes('locked')) return 'locked';
  if (message.includes('age_not_confirmed')) return 'age_not_confirmed';
  if (message.includes('elite_required')) return 'elite_required';
  if (message.includes('hustle_not_available') || message.includes('already_active')) return 'hustle_not_available';
  if (/network|fetch|timeout/i.test(message)) return 'offline';
  return 'unknown';
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const mode: 'supabase' | 'preview' = isSupabaseConfigured ? 'supabase' : 'preview';

  // --- Supabase mode state ---
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  /** offline = showing the cached copy; failed = nothing could be loaded. */
  const [account, setAccount] = useState<(AccountSnapshot & { userId: string; offline?: boolean; failed?: boolean }) | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // --- Preview mode state ---
  const [preview, setPreview] = useState<PreviewAccount>(EMPTY_PREVIEW);

  useEffect(() => {
    if (!supabase) {
      loadJSON<Partial<PreviewAccount>>(PREVIEW_KEY).then((saved) => {
        if (saved) setPreview(migratePreview(saved));
        setSessionReady(true);
      });
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = mode === 'supabase' ? (session?.user.id ?? null) : preview.signedIn ? 'preview-user' : null;

  const fetchAccount = useCallback(async (uid: string): Promise<AccountSnapshot> => {
    const snapshot = await loadAccountRows(uid);
    setAccount({ userId: uid, ...snapshot });
    saveJSON(accountCacheKey(uid), snapshot);
    return snapshot;
  }, []);

  // Load the account whenever a different user signs in. Offline: use the
  // copy from the last visit, so the app still opens.
  useEffect(() => {
    if (mode !== 'supabase' || !userId) return;
    let cancelled = false;
    loadAccountRows(userId).then(
      (snapshot) => {
        if (cancelled) return;
        setAccount({ userId, ...snapshot });
        saveJSON(accountCacheKey(userId), snapshot);
      },
      async () => {
        const cached = await loadJSON<AccountSnapshot>(accountCacheKey(userId));
        if (cancelled) return;
        setAccount(cached?.profile ? { ...EMPTY_SNAPSHOT, ...cached, userId, offline: true } : { userId, ...EMPTY_SNAPSHOT, failed: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mode, userId, reloadKey]);

  // Keep the profile's time zone in sync with the phone (streak days are
  // counted in the user's own time zone on the server).
  const profileTimeZone = account?.profile?.timezone;
  const accountUserId = account?.userId;
  useEffect(() => {
    const tz = deviceTimeZone();
    if (mode !== 'supabase' || !supabase || !accountUserId || !tz || profileTimeZone === tz) return;
    supabase
      .from('profiles')
      .update({ timezone: tz })
      .eq('id', accountUserId)
      .select('*')
      .single()
      .then(({ data }) => {
        if (data) setAccount((prev) => (prev && prev.userId === data.id ? { ...prev, profile: data } : prev));
      });
  }, [mode, accountUserId, profileTimeZone]);

  const savePreview = useCallback((next: PreviewAccount | ((prev: PreviewAccount) => PreviewAccount)) => {
    setPreview((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      saveJSON(PREVIEW_KEY, value);
      return value;
    });
  }, []);

  const current: AccountSnapshot =
    mode === 'supabase'
      ? account && account.userId === userId
        ? { profile: account.profile, userHustles: account.userHustles, fastPivotCredits: account.fastPivotCredits, bonusMessages: account.bonusMessages }
        : EMPTY_SNAPSHOT
      : { profile: preview.profile, userHustles: preview.userHustles, fastPivotCredits: preview.fastPivotCredits, bonusMessages: preview.bonusMessages };

  const accountLoading = mode === 'supabase' && !!userId && account?.userId !== userId;
  const ready = sessionReady && !accountLoading;

  const value = useMemo<AccountContextValue>(() => {
    const previewSnapshot = (p: PreviewAccount): AccountSnapshot => ({
      profile: p.profile,
      userHustles: p.userHustles,
      fastPivotCredits: p.fastPivotCredits,
      bonusMessages: p.bonusMessages,
    });

    const refresh = async (): Promise<AccountSnapshot> => {
      if (mode === 'preview') return previewSnapshot(preview);
      if (!userId) return EMPTY_SNAPSHOT;
      try {
        return await fetchAccount(userId);
      } catch {
        // Offline: keep what we have.
        return { profile: current.profile, userHustles: current.userHustles, fastPivotCredits: current.fastPivotCredits, bonusMessages: current.bonusMessages };
      }
    };

    const previewSignIn = (method: string): SignInResult => {
      const next: PreviewAccount = preview.profile ? { ...preview, signedIn: true } : { ...EMPTY_PREVIEW, signedIn: true, profile: previewProfile() };
      savePreview(next);
      track('sign_in', { method, new_account: isNewAccount(next.profile) });
      return { ok: true, snapshot: previewSnapshot(next) };
    };

    /** After any sign-in: remember language, country, time zone and (Apple, first time) the name. */
    const finishSignIn = async (method: string, fullName?: string | null): Promise<SignInResult> => {
      const { data } = await supabase!.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return { ok: false, error: 'no_session' };
      const patch: ProfileUpdate = { locale: i18n.language === 'pl' ? 'pl' : 'en', country: deviceCountry(), timezone: deviceTimeZone() };
      if (fullName) patch.display_name = fullName.slice(0, 80);
      await supabase!.from('profiles').update(patch).eq('id', uid);
      try {
        const snapshot = await fetchAccount(uid);
        track('sign_in', { method, new_account: isNewAccount(snapshot.profile) });
        return { ok: true, snapshot };
      } catch {
        return { ok: false, error: 'offline' };
      }
    };

    const signIn = async (provider: 'apple' | 'google'): Promise<SignInResult> => {
      if (mode === 'preview') return previewSignIn(provider);
      const outcome: AuthOutcome = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
      if (!outcome.ok) return outcome;
      if (Platform.OS === 'web') {
        // The page is navigating to Google/Apple; the session arrives on return.
        return { ok: true, snapshot: EMPTY_SNAPSHOT };
      }
      return finishSignIn(provider, outcome.fullName);
    };

    const signInWithEmail: AccountContextValue['signInWithEmail'] = async (email, password) => {
      if (mode === 'preview') return previewSignIn('email');
      const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return { ok: false, error: /network|fetch|timeout/i.test(error.message) ? 'offline' : 'invalid_credentials' };
      return finishSignIn('email');
    };

    const signOut = async () => {
      await resetAnalytics();
      if (mode === 'preview') {
        savePreview({ ...preview, signedIn: false });
        return;
      }
      await supabase!.auth.signOut();
      setAccount(null);
    };

    const deleteAccount = async (): Promise<ActionResult> => {
      if (mode === 'preview') {
        track('account_deleted');
        await resetAnalytics();
        await removeKey(PREVIEW_KEY);
        setPreview(EMPTY_PREVIEW);
        return { ok: true };
      }
      const uid = userId;
      const result = await deleteAccountOnServer();
      if (!result.ok) return { ok: false, error: result.error ?? 'delete_failed' };
      track('account_deleted');
      await flushAnalytics();
      await resetAnalytics();
      if (uid) await removeKey(accountCacheKey(uid));
      // The account no longer exists on the server; clear the local session.
      await supabase!.auth.signOut({ scope: 'local' });
      setAccount(null);
      return { ok: true };
    };

    const updateProfile: AccountContextValue['updateProfile'] = async (patch) => {
      if (mode === 'preview') {
        if (!preview.profile) return { ok: false, error: 'not_signed_in' };
        const profile = { ...preview.profile, ...patch } as ProfileRow;
        savePreview({ ...preview, profile });
        return { ok: true, profile };
      }
      if (!userId) return { ok: false, error: 'not_signed_in' };
      const { data, error } = await supabase!.from('profiles').update(patch).eq('id', userId).select('*').single();
      if (error || !data) return { ok: false, error: error?.message ?? 'update_failed' };
      setAccount((prev) => (prev && prev.userId === userId ? { ...prev, profile: data } : prev));
      return { ok: true, profile: data };
    };

    const chooseHustle: AccountContextValue['chooseHustle'] = async (hustleId, options = {}) => {
      const slot = options.slot ?? 1;
      if (mode === 'preview') {
        // Mirrors the rules of the choose_hustle() database function.
        const active = preview.userHustles.find((u) => u.slot === slot && u.status === 'active');
        let credits = preview.fastPivotCredits;
        if (active) {
          // A finished roadmap frees the slot even inside the 30 days.
          const locked = new Date(active.lock_until).getTime() > Date.now() && !active.completed_at;
          if (locked) {
            if (!options.useFastPivot) return { ok: false, error: 'locked' };
            if (credits < 1) return { ok: false, error: 'no_credits' };
            credits -= 1;
          } else if (!options.replaceCurrent) {
            return { ok: false, error: 'confirm_required' };
          }
        }
        const now = Date.now();
        const row: UserHustleRow = {
          id: `preview-${now}`,
          user_id: 'preview-user',
          hustle_id: hustleId,
          slot,
          started_at: new Date(now).toISOString(),
          lock_until: new Date(now + 30 * DAY_MS).toISOString(),
          status: 'active',
          personalized_roadmap: null,
          completed_at: null,
          personalization_status: null,
          personalization_error: null,
          personalization_started_at: null,
          personalized_at: null,
        };
        savePreview({
          ...preview,
          fastPivotCredits: credits,
          userHustles: [...preview.userHustles.filter((u) => u.slot !== slot), row],
          // Same as the spins trigger on the server.
          progress: awardBadges(preview.progress, ['first_spin', 'chosen'], now).progress,
        });
        return { ok: true };
      }
      const { error } = await supabase!.rpc('choose_hustle', {
        p_hustle_id: hustleId,
        p_slot: slot,
        p_use_fast_pivot: options.useFastPivot ?? false,
        p_replace_current: options.replaceCurrent ?? false,
      });
      if (error) return { ok: false, error: mapChooseError(error.message) };
      if (userId) await fetchAccount(userId).catch(() => {});
      return { ok: true };
    };

    const activateFastPivot: AccountContextValue['activateFastPivot'] = async (slot = 1) => {
      if (mode === 'preview') {
        // Mirrors the use_fast_pivot() database function.
        const active = preview.userHustles.find((u) => u.slot === slot && u.status === 'active');
        if (!active) return { ok: false, error: 'no_active_hustle' };
        if (new Date(active.lock_until).getTime() <= Date.now() || active.completed_at) return { ok: false, error: 'not_locked' };
        if (preview.fastPivotCredits < 1) return { ok: false, error: 'no_credits' };
        const left = preview.fastPivotCredits - 1;
        savePreview({ ...preview, fastPivotCredits: left, userHustles: preview.userHustles.filter((u) => u.id !== active.id) });
        track('fast_pivot_used', { slot, via: 'unlock', credits_left: left });
        return { ok: true, left };
      }
      const { data, error } = await supabase!.rpc('use_fast_pivot', { p_slot: slot });
      if (error) return { ok: false, error: mapPivotError(error.message) };
      const left = typeof data === 'number' ? data : 0;
      track('fast_pivot_used', { slot, via: 'unlock', credits_left: left });
      if (userId) await fetchAccount(userId).catch(() => {});
      return { ok: true, left };
    };

    const redeemReferral = async (code: string): Promise<boolean> => {
      let valid: boolean;
      if (mode === 'preview') valid = /^[A-Z0-9]{6,12}$/i.test(code.trim());
      else {
        const { data, error } = await supabase!.rpc('redeem_referral', { p_code: code.trim() });
        valid = !error && data === true;
      }
      track('referral_code_entered', { valid });
      return valid;
    };

    const previewTools =
      mode === 'preview'
        ? {
            addFastPivotCredit: () => savePreview({ ...preview, fastPivotCredits: preview.fastPivotCredits + 1 }),
            addBonusMessages: (count: number) => savePreview((prev) => ({ ...prev, bonusMessages: prev.bonusMessages + count })),
            setPlan: (tier: Tier) =>
              savePreview((prev) =>
                prev.profile
                  ? {
                      ...prev,
                      profile: {
                        ...prev.profile,
                        tier,
                        // Same as the server: coach styles are Elite-only.
                        coach_personality: tier === 'elite' ? prev.profile.coach_personality : 'balanced',
                        subscription_product: tier === 'free' ? null : `chosen_${tier}_yearly`,
                        subscription_store: tier === 'free' ? null : 'preview',
                        subscription_expires_at: tier === 'free' ? null : new Date(Date.now() + (tier === 'pro' ? 3 : 365) * DAY_MS).toISOString(),
                        subscription_will_renew: tier === 'free' ? null : true,
                        subscription_is_trial: tier === 'pro',
                        subscription_is_promo: false,
                      },
                    }
                  : prev,
              ),
            endCommitmentNow: () =>
              savePreview({
                ...preview,
                userHustles: preview.userHustles.map((u) => ({
                  ...u,
                  started_at: new Date(Date.now() - 31 * DAY_MS).toISOString(),
                  lock_until: new Date(Date.now() - 60_000).toISOString(),
                })),
              }),
            // Moves the hustle 7 days into the past so the next weekly check-in opens.
            skipWeek: () =>
              savePreview({
                ...preview,
                userHustles: preview.userHustles.map((u) => ({
                  ...u,
                  started_at: new Date(new Date(u.started_at).getTime() - 7 * DAY_MS).toISOString(),
                  lock_until: new Date(new Date(u.lock_until).getTime() - 7 * DAY_MS).toISOString(),
                })),
              }),
          }
        : null;

    return {
      mode,
      ready,
      signedIn: !!userId,
      userId,
      email: mode === 'supabase' ? (session?.user.email ?? null) : preview.signedIn ? 'alex@example.com' : null,
      profile: current.profile,
      userHustles: current.userHustles,
      fastPivotCredits: current.fastPivotCredits,
      bonusMessages: current.bonusMessages,
      offline: mode === 'supabase' && !!account?.offline && account.userId === userId,
      loadFailed: mode === 'supabase' && !!account?.failed && account.userId === userId,
      retryLoad: () => setReloadKey((k) => k + 1),
      signIn,
      signInWithEmail,
      signOut,
      deleteAccount,
      updateProfile,
      chooseHustle,
      activateFastPivot,
      redeemReferral,
      refresh,
      previewTools,
      preview: mode === 'preview' ? { data: preview, update: savePreview } : null,
    };
  }, [
    mode,
    ready,
    userId,
    session,
    preview,
    account?.offline,
    account?.failed,
    account?.userId,
    current.profile,
    current.userHustles,
    current.fastPivotCredits,
    current.bonusMessages,
    fetchAccount,
    savePreview,
  ]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used inside AccountProvider');
  return ctx;
}
