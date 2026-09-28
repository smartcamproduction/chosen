import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import messagesFile from '@/data/dailyMessages.json';
import type { Language } from '@/i18n';
import { track } from '@/lib/analytics';
import { uploadScreenshots, removeScreenshots, type CheckinInput } from '@/lib/checkin';
import type { CheckinRow, StepProgressRow, UserBadgeRow } from '@/lib/database.types';
import { DEFAULT_RATES, type Rates } from '@/lib/money';
import { previewCompleteStep, previewSubmitCheckin, type CheckinError, type StepError } from '@/lib/previewEngine';
import { checkinWeekAt, localDay, parseReward, shiftDay, type RewardResult } from '@/lib/progression';
import type { Roadmap } from '@/lib/roadmap';
import { loadJSON, saveJSON } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import { useAccount } from './AccountProvider';

/**
 * The signed-in user's progress: finished steps, check-ins, badges and
 * active days, plus the reference data around them (exchange rates, daily
 * messages). Every reward-giving action goes through the server
 * (complete_step / submit_checkin); in preview mode the same rules run on
 * the device.
 */

export interface ProgressData {
  stepProgress: StepProgressRow[];
  checkins: CheckinRow[];
  userBadges: UserBadgeRow[];
  /** 'YYYY-MM-DD' days with at least one step, check-in or coach message. */
  activityDays: string[];
  /** Today's line from daily-motivation (AI for Pro/Elite), if prepared. */
  todayLine: { text: string; kind: 'motivation' | 'nudge' } | null;
}

export type ProgressError = StepError | CheckinError | 'upload_failed' | 'unsupported_currency' | 'offline' | 'unknown';
export type ActionOutcome = { ok: true; reward: RewardResult } | { ok: false; error: ProgressError };

export interface Percentile {
  topPercent: number;
  country: string;
}

interface ProgressContextValue extends ProgressData {
  /** true once the first load finished. */
  ready: boolean;
  /** Nothing could be loaded (offline and no saved copy). */
  loadFailed: boolean;
  rates: Rates;
  dailyMessages: Record<Language, string[]>;
  completeStep: (userHustleId: string, stepId: string, roadmap: Roadmap) => Promise<ActionOutcome>;
  submitCheckin: (input: CheckinInput) => Promise<ActionOutcome>;
  /** "Top X% in {country}": null unless the group has 50+ users. */
  percentile: (userHustleId: string) => Promise<Percentile | null>;
  refresh: () => Promise<void>;
}

const EMPTY: ProgressData = { stepProgress: [], checkins: [], userBadges: [], activityDays: [], todayLine: null };
const RATES_KEY = 'chosen.cache.rates';
const MESSAGES_KEY = 'chosen.cache.dailyMessages';
/** The last progress seen on this device, for opening the app offline. */
const progressCacheKey = (userId: string) => `chosen.cache.progress.${userId}`;
const BUNDLED_MESSAGES: Record<Language, string[]> = { en: messagesFile.en, pl: messagesFile.pl };

const ProgressContext = createContext<ProgressContextValue | null>(null);

function mapError(message: string): ProgressError {
  const known: ProgressError[] = [
    'hustle_not_active',
    'step_not_found',
    'already_done',
    'step_locked',
    'checkin_not_open',
    'checkin_already_done',
    'invalid_amount',
    'unsupported_currency',
  ];
  const hit = known.find((k) => message.includes(k));
  if (hit) return hit;
  if (/network|fetch|timeout|failed to/i.test(message)) return 'offline';
  return 'unknown';
}

async function loadProgressRows(userId: string, userHustleIds: string[]): Promise<ProgressData> {
  if (!supabase) return EMPTY;
  const since = shiftDay(localDay(), -60);
  const [steps, checkins, badges, days, line] = await Promise.all([
    userHustleIds.length
      ? supabase.from('step_progress').select('*').in('user_hustle_id', userHustleIds)
      : Promise.resolve({ data: [] as StepProgressRow[], error: null }),
    supabase.from('checkins').select('*').order('created_at'),
    supabase.from('user_badges').select('*').eq('user_id', userId),
    supabase.from('activity_days').select('*').eq('user_id', userId).gte('day', since),
    supabase.from('daily_pushes').select('text, kind').eq('user_id', userId).eq('local_day', localDay()).maybeSingle(),
  ]);
  const error = steps.error ?? checkins.error ?? badges.error ?? days.error;
  if (error) throw error;
  return {
    stepProgress: steps.data ?? [],
    checkins: checkins.data ?? [],
    userBadges: badges.data ?? [],
    activityDays: (days.data ?? []).map((d) => d.day),
    todayLine: line.data ? { text: line.data.text, kind: line.data.kind } : null,
  };
}

export function ProgressProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const { mode, userId, userHustles } = account;
  const [server, setServer] = useState<{ userId: string; data: ProgressData; failed?: boolean } | null>(null);
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES);
  const [dailyMessages, setDailyMessages] = useState<Record<Language, string[]>>(BUNDLED_MESSAGES);

  // Reference data: cached copy first, then the database.
  useEffect(() => {
    let cancelled = false;
    loadJSON<Rates>(RATES_KEY).then((cached) => {
      if (!cancelled && cached) setRates({ ...DEFAULT_RATES, ...cached });
    });
    loadJSON<Record<Language, string[]>>(MESSAGES_KEY).then((cached) => {
      if (!cancelled && cached?.en?.length && cached?.pl?.length) setDailyMessages(cached);
    });
    if (supabase) {
      supabase
        .from('exchange_rates')
        .select('currency, usd_rate')
        .then(({ data }) => {
          if (cancelled || !data?.length) return;
          const next: Rates = { ...DEFAULT_RATES };
          for (const r of data) next[r.currency] = Number(r.usd_rate);
          setRates(next);
          saveJSON(RATES_KEY, next);
        });
      supabase
        .from('daily_messages')
        .select('*')
        .order('id')
        .then(({ data }) => {
          if (cancelled || !data?.length) return;
          const next = {
            en: data.filter((m) => m.locale === 'en').map((m) => m.text),
            pl: data.filter((m) => m.locale === 'pl').map((m) => m.text),
          };
          if (!next.en.length || !next.pl.length) return;
          setDailyMessages(next);
          saveJSON(MESSAGES_KEY, next);
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const hustleIdsKey = userHustles.map((u) => u.id).join(',');

  const reload = useCallback(async () => {
    if (mode !== 'supabase' || !userId) return;
    const ids = hustleIdsKey ? hustleIdsKey.split(',') : [];
    const data = await loadProgressRows(userId, ids);
    setServer({ userId, data });
    saveJSON(progressCacheKey(userId), data);
  }, [mode, userId, hustleIdsKey]);

  // Load whenever the user or their committed hustles change. Offline: the
  // copy from the last visit (or keep what's on screen).
  useEffect(() => {
    if (mode !== 'supabase' || !userId) return;
    let cancelled = false;
    const ids = hustleIdsKey ? hustleIdsKey.split(',') : [];
    loadProgressRows(userId, ids).then(
      (data) => {
        if (cancelled) return;
        setServer({ userId, data });
        saveJSON(progressCacheKey(userId), data);
      },
      async () => {
        const cached = await loadJSON<ProgressData>(progressCacheKey(userId));
        if (cancelled) return;
        setServer((prev) =>
          prev && prev.userId === userId && !prev.failed
            ? prev
            : cached
              ? { userId, data: { ...EMPTY, ...cached } }
              : { userId, data: EMPTY, failed: true },
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mode, userId, hustleIdsKey]);

  // Stable, so screens can call it from an effect without looping.
  const percentile = useCallback(
    async (userHustleId: string): Promise<Percentile | null> => {
      if (mode !== 'supabase' || !supabase) return null;
      const { data: json, error } = await supabase.rpc('hustle_percentile', { p_user_hustle_id: userHustleId });
      if (error || !json || typeof json !== 'object' || Array.isArray(json)) return null;
      const top = Number(json.top_percent);
      const country = typeof json.country === 'string' ? json.country : '';
      return Number.isFinite(top) && country ? { topPercent: top, country } : null;
    },
    [mode],
  );

  const previewProgress = account.preview?.data.progress;
  const data = useMemo<ProgressData>(
    () =>
      mode === 'preview'
        ? previewProgress
          ? { ...previewProgress, todayLine: null }
          : EMPTY
        : server && server.userId === userId
          ? server.data
          : EMPTY,
    [mode, previewProgress, server, userId],
  );
  const ready = mode === 'preview' || !userId || server?.userId === userId;
  const loadFailed = mode === 'supabase' && !!userId && server?.userId === userId && !!server.failed;

  const value = useMemo<ProgressContextValue>(() => {
    const preview = account.preview;

    const stepDone = (stepId: string, reward: RewardResult) =>
      track('step_completed', {
        step_id: stepId,
        xp: reward.xpGained,
        level_up: reward.levelAfter > reward.levelBefore,
        roadmap_completed: reward.roadmapCompleted,
        streak: reward.streak,
      });
    const checkinDone = (input: CheckinInput, reward: RewardResult) =>
      track('checkin_submitted', {
        week: reward.week ?? null,
        has_revenue: input.revenue > 0,
        profit_positive: input.revenue > input.costs,
        screenshots: input.screenshots.length,
        hours_logged: input.hours != null,
        rank_up: reward.rankAfter !== reward.rankBefore,
      });

    const completeStep: ProgressContextValue['completeStep'] = async (userHustleId, stepId, roadmap) => {
      if (preview) {
        const { data: p } = preview;
        if (!p.profile) return { ok: false, error: 'hustle_not_active' };
        const result = previewCompleteStep({ profile: p.profile, userHustles: p.userHustles, progress: p.progress }, userHustleId, stepId, roadmap, Date.now());
        if ('error' in result) return { ok: false, error: result.error };
        preview.update({ ...p, profile: result.state.profile, userHustles: result.state.userHustles, progress: result.state.progress });
        stepDone(stepId, result.reward);
        return { ok: true, reward: result.reward };
      }
      if (!supabase) return { ok: false, error: 'unknown' };
      const { data: json, error } = await supabase.rpc('complete_step', { p_user_hustle_id: userHustleId, p_step_id: stepId });
      if (error) {
        const mapped = mapError(error.message);
        if (mapped === 'already_done') await reload().catch(() => {});
        return { ok: false, error: mapped };
      }
      const reward = parseReward(json);
      // Show the step as done right away, then sync everything.
      setServer((prev) =>
        prev && prev.userId === userId
          ? {
              ...prev,
              data: {
                ...prev.data,
                stepProgress: [...prev.data.stepProgress, { user_hustle_id: userHustleId, step_id: stepId, completed_at: new Date().toISOString() }],
              },
            }
          : prev,
      );
      await Promise.all([account.refresh(), reload()]).catch(() => {});
      if (reward) stepDone(stepId, reward);
      return reward ? { ok: true, reward } : { ok: false, error: 'unknown' };
    };

    const submitCheckin: ProgressContextValue['submitCheckin'] = async (input) => {
      const { screenshots, ...rest } = input;
      if (preview) {
        const { data: p } = preview;
        if (!p.profile) return { ok: false, error: 'hustle_not_active' };
        const result = previewSubmitCheckin(
          { profile: p.profile, userHustles: p.userHustles, progress: p.progress },
          { ...rest, screenshotPaths: screenshots.map((s) => s.uri) },
          rates,
          Date.now(),
        );
        if ('error' in result) return { ok: false, error: result.error };
        preview.update({ ...p, profile: result.state.profile, userHustles: result.state.userHustles, progress: result.state.progress });
        checkinDone(input, result.reward);
        return { ok: true, reward: result.reward };
      }
      if (!supabase || !userId) return { ok: false, error: 'unknown' };

      const uh = userHustles.find((u) => u.id === input.userHustleId);
      const week = uh ? checkinWeekAt(new Date(uh.started_at), Date.now()) : 0;
      let paths: string[] = [];
      try {
        paths = await uploadScreenshots(userId, input.userHustleId, week, screenshots);
      } catch {
        return { ok: false, error: 'upload_failed' };
      }

      const { data: json, error } = await supabase.rpc('submit_checkin', {
        p_user_hustle_id: input.userHustleId,
        p_feeling: input.feeling,
        p_revenue: input.revenue,
        p_costs: input.costs,
        p_currency: input.currency,
        p_hours: input.hours,
        p_metrics: input.metrics,
        p_motivation: input.motivation,
        p_blockers: input.blockers,
        p_next_week_plan: input.nextWeekPlan,
        p_screenshot_paths: paths,
      });
      if (error) {
        await removeScreenshots(paths);
        return { ok: false, error: mapError(error.message) };
      }
      await Promise.all([account.refresh(), reload()]).catch(() => {});
      const reward = parseReward(json);
      if (reward) checkinDone(input, reward);
      return reward ? { ok: true, reward } : { ok: false, error: 'unknown' };
    };

    return {
      ...data,
      ready,
      loadFailed,
      rates,
      dailyMessages,
      completeStep,
      submitCheckin,
      percentile,
      refresh: () => reload().catch(() => {}),
    };
  }, [account, data, ready, loadFailed, rates, dailyMessages, userId, userHustles, reload, percentile]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgressData(): ProgressContextValue {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgressData must be used inside ProgressProvider');
  return ctx;
}
