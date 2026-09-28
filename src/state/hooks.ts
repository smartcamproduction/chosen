import type { Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SEED_HUSTLES, type Hustle } from '@/data/hustles';
import { parseQuiz, type QuizAnswers } from '@/data/quiz';
import { useLanguage } from '@/i18n/LanguageProvider';
import type { CoachPersonality, Tier, UserHustleRow } from '@/lib/database.types';
import { formatMoney, formatNumber, type Currency } from '@/lib/format';
import { checkinAmounts, fromUsd, profitUsd, totals } from '@/lib/money';
import { checkinState, effectiveStreak, isActiveToday, levelForXp } from '@/lib/progression';
import { buildRoadmapView, durationParts, parseRoadmap } from '@/lib/roadmap';
import { flushSpins, queueSpin } from '@/lib/spinLog';

import { useAccount, type AccountSnapshot } from './AccountProvider';
import { useApp } from './AppState';
import { useHustles } from './HustlesProvider';
import { useProgressData } from './ProgressProvider';
import { useRoadmaps, type RoadmapSourceKind } from './RoadmapsProvider';

const DAY_MS = 86_400_000;

/** Current plan. In development the Profile "Developer preview" can override it. */
export function useTier(): Tier {
  const { profile } = useAccount();
  const { state } = useApp();
  if (__DEV__ && state.devTier) return state.devTier;
  return profile?.tier ?? 'free';
}

export function useCurrency(): Currency {
  const { profile } = useAccount();
  const { state } = useApp();
  return (profile?.currency as Currency | undefined) ?? state.currency;
}

export function useQuiz(): QuizAnswers | null {
  const { profile } = useAccount();
  return parseQuiz(profile?.quiz);
}

export function useCoachPersonality(): CoachPersonality {
  const { profile } = useAccount();
  return profile?.coach_personality ?? 'balanced';
}

/** "45 min" / "1,5 h" in the app language. */
export function useDuration() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  return (minutes: number) => {
    const d = durationParts(minutes);
    return d.unit === 'min' ? t('roadmap.minutes', { n: d.value }) : t('roadmap.hours', { n: formatNumber(d.value, language, d.value % 1 ? 1 : 0) });
  };
}

/** A clock read once per screen (keeps renders pure). */
export function useNow(): number {
  const [now] = useState(() => Date.now());
  return now;
}

/** XP, level, streak and rank as they stand today. */
export function useProgress() {
  const { profile } = useAccount();
  const now = useNow();
  const xp = profile?.xp ?? 0;
  return {
    xp,
    level: levelForXp(xp),
    streak: effectiveStreak(profile, now),
    bestStreak: profile?.streak_best ?? 0,
    activeToday: isActiveToday(profile, now),
    rank: profile?.rank ?? 'rookie',
  };
}

/**
 * The committed hustle for a slot. Before the user commits, the first
 * hustle is shown so screens still render (they're not reachable then).
 */
export function useActiveHustle(slot: 1 | 2 = 1) {
  const { userHustles } = useAccount();
  const { byId } = useHustles();
  const userHustle: UserHustleRow | null = userHustles.find((u) => u.slot === slot) ?? null;
  const hustle: Hustle = byId(userHustle?.hustle_id) ?? byId('newsletter') ?? SEED_HUSTLES[0];

  const now = useNow();
  const startedAt = userHustle ? new Date(userHustle.started_at) : new Date(now);
  const lockUntil = userHustle ? new Date(userHustle.lock_until) : new Date(startedAt.getTime() + 30 * DAY_MS);
  /** Day of the hustle (1 = the day it was chosen), not capped. */
  const dayNumber = Math.max(1, Math.floor((now - startedAt.getTime()) / DAY_MS) + 1);
  const sprintDay = Math.min(30, dayNumber);
  const daysLeft = Math.max(0, Math.ceil((lockUntil.getTime() - now) / DAY_MS));
  const locked = lockUntil.getTime() > now && !userHustle?.completed_at;

  return { hustle, userHustle, isCommitted: !!userHustle, sprintDay, dayNumber, startedAt, lockUntil, daysLeft, locked };
}

/**
 * The roadmap for a slot with the user's progress: the personalized one
 * if it exists, otherwise the approved base roadmap in the app language.
 */
export function useRoadmap(slot: 1 | 2 = 1) {
  const active = useActiveHustle(slot);
  const { language } = useLanguage();
  const { baseRoadmap } = useRoadmaps();
  const { stepProgress } = useProgressData();

  const personalized = active.userHustle?.personalized_roadmap ? parseRoadmap(active.userHustle.personalized_roadmap) : null;
  const base = personalized ? null : baseRoadmap(active.hustle.id, active.hustle.slug, language);
  const roadmap = personalized ?? base?.roadmap ?? null;
  const source: RoadmapSourceKind | null = personalized ? 'personalized' : (base?.source ?? null);
  const doneIds = stepProgress.filter((s) => s.user_hustle_id === active.userHustle?.id).map((s) => s.step_id);
  const view = roadmap ? buildRoadmapView(roadmap, doneIds) : null;

  return { ...active, roadmap, source, view };
}

/** Whether this week's check-in is open, done, or not yet due. */
export function useCheckin(slot: 1 | 2 = 1) {
  const { userHustle } = useActiveHustle(slot);
  const { checkins } = useProgressData();
  const now = useNow();
  if (!userHustle) return null;
  return checkinState(userHustle, checkins, now);
}

/**
 * Money in the user's currency: formatting, all-time and monthly profit,
 * and per-hustle totals from the weekly check-ins.
 */
export function useMoney() {
  const currency = useCurrency();
  const { language } = useLanguage();
  const { checkins, rates } = useProgressData();
  const now = useNow();

  const format = (amount: number, opts?: { decimals?: number; signed?: boolean }) => formatMoney(amount, currency, language, opts);
  const month = new Date(now);
  const thisMonth = checkins.filter((c) => {
    const d = new Date(c.created_at);
    return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth();
  });
  const allTimeUsd = profitUsd(checkins, rates);

  return {
    currency,
    rates,
    format,
    /** USD → the user's currency (e.g. rank thresholds, income goals). */
    fromUsd: (usd: number) => fromUsd(usd, currency, rates),
    amounts: (c: (typeof checkins)[number]) => checkinAmounts(c, currency, rates),
    allTimeUsd,
    allTime: fromUsd(allTimeUsd, currency, rates),
    thisMonth: totals(thisMonth, currency, rates),
    forHustle: (userHustleId: string | undefined) => {
      const own = checkins.filter((c) => c.user_hustle_id === userHustleId).sort((a, b) => a.week_number - b.week_number);
      return { checkins: own, ...totals(own, currency, rates) };
    },
  };
}

/**
 * Where a user should be right now, based on their account.
 *   not signed in → welcome · no age check → age · no quiz → consent + quiz
 *   no committed hustle → commit (if one was drawn) or the machine · else → Today
 */
export function nextRoute(
  account: { signedIn: boolean } & Pick<AccountSnapshot, 'profile' | 'userHustles'>,
  local: { ageBlocked: boolean; pendingHustleId: string | null },
): Href {
  if (local.ageBlocked) return '/blocked';
  if (!account.signedIn || !account.profile) return '/welcome';
  if (!account.profile.age_confirmed_at) return '/age';
  if (!parseQuiz(account.profile.quiz)) return '/consent';
  if (account.userHustles.length === 0) return local.pendingHustleId ? '/commit' : '/draw';
  return '/today';
}

/**
 * Logs every spin to the `spins` table (via an on-device queue, so offline
 * spins are sent later). Signed-out spins are logged without a user.
 */
export function useSpinLogger() {
  const { mode, userId } = useAccount();
  const { hustles, fromServer } = useHustles();

  const idForSlug = (slug: string) => hustles.find((h) => h.slug === slug && h.fromServer)?.id;

  // Send anything still waiting (e.g. from an earlier offline session)
  // as soon as the real hustle list is available.
  useEffect(() => {
    if (mode !== 'supabase' || !fromServer) return;
    flushSpins(userId, (slug) => hustles.find((h) => h.slug === slug && h.fromServer)?.id);
  }, [mode, fromServer, userId, hustles]);

  return (hustle: Hustle) => {
    if (mode !== 'supabase') return;
    queueSpin({ slug: hustle.slug, userId, at: new Date().toISOString() }).then(() => flushSpins(userId, idForSlug));
  };
}

/** True when the signed-in user still has to do the age check, consent or questions. */
export function needsOnboarding(profile: AccountSnapshot['profile']): boolean {
  return !profile?.age_confirmed_at || !parseQuiz(profile.quiz);
}
