import type { BadgeId } from '@/data/badges';

import type { CheckinInput } from './checkin';
import type { CheckinRow, ProfileRow, StepProgressRow, UserBadgeRow, UserHustleRow } from './database.types';
import { profitUsd, toUsd, type Rates } from './money';
import {
  checkinWeekAt,
  levelForXp,
  localDay,
  rankForProfitUsd,
  shiftDay,
  XP_PER_ACTIVE_DAY,
  XP_PER_CHECKIN,
  type RewardResult,
} from './progression';
import type { Roadmap } from './roadmap';

/**
 * PREVIEW MODE ONLY (backend not connected yet). The same rules as the
 * database functions complete_step() and submit_checkin(), applied to the
 * account saved on this device, so every Phase 4 screen can be tried out.
 * With Supabase connected, none of this runs: the server decides.
 */

export interface PreviewProgress {
  stepProgress: StepProgressRow[];
  checkins: CheckinRow[];
  userBadges: UserBadgeRow[];
  activityDays: string[];
}

export const EMPTY_PROGRESS: PreviewProgress = { stepProgress: [], checkins: [], userBadges: [], activityDays: [] };

export interface EngineState {
  profile: ProfileRow;
  userHustles: UserHustleRow[];
  progress: PreviewProgress;
}

export type StepError = 'hustle_not_active' | 'step_not_found' | 'already_done' | 'step_locked';
export type CheckinError = 'hustle_not_active' | 'checkin_not_open' | 'checkin_already_done' | 'invalid_amount';

export function awardBadges(progress: PreviewProgress, ids: BadgeId[], now: number) {
  const awarded: BadgeId[] = [];
  let userBadges = progress.userBadges;
  for (const id of ids) {
    if (userBadges.some((b) => b.badge_id === id) || awarded.includes(id)) continue;
    awarded.push(id);
    userBadges = [...userBadges, { user_id: 'preview-user', badge_id: id, earned_at: new Date(now).toISOString() }];
  }
  return { progress: { ...progress, userBadges }, awarded };
}

function addXp(profile: ProfileRow, amount: number): ProfileRow {
  const xp = profile.xp + Math.max(0, amount);
  return { ...profile, xp, level: levelForXp(xp) };
}

/** First activity of the day: +10 XP and the streak grows (or restarts). */
function recordActivity(state: EngineState, now: number) {
  const today = localDay(new Date(now));
  const { profile } = state;
  if (profile.last_active_date && today <= profile.last_active_date) {
    return { state, xp: 0, badges: [] as BadgeId[] };
  }
  const streak = profile.last_active_date === shiftDay(today, -1) ? profile.streak_current + 1 : 1;
  const nextProfile = addXp(
    { ...profile, streak_current: streak, streak_best: Math.max(profile.streak_best, streak), last_active_date: today },
    XP_PER_ACTIVE_DAY,
  );
  const want: BadgeId[] = [];
  if (streak >= 7) want.push('streak_7');
  if (streak >= 30) want.push('streak_30');
  const progress = { ...state.progress, activityDays: [...state.progress.activityDays.filter((d) => d !== today), today] };
  const badges = awardBadges(progress, want, now);
  return { state: { ...state, profile: nextProfile, progress: badges.progress }, xp: XP_PER_ACTIVE_DAY, badges: badges.awarded };
}

function summary(before: ProfileRow, after: EngineState, xp: number, activityXp: number, badges: BadgeId[], roadmapCompleted: boolean): RewardResult {
  return {
    xpGained: xp + activityXp,
    activityXp,
    xpTotal: after.profile.xp,
    levelBefore: before.level,
    levelAfter: after.profile.level,
    rankBefore: before.rank,
    rankAfter: after.profile.rank,
    streak: after.profile.streak_current,
    newBadges: badges,
    roadmapCompleted,
  };
}

export function previewCompleteStep(
  state: EngineState,
  userHustleId: string,
  stepId: string,
  roadmap: Roadmap,
  now: number,
): { state: EngineState; reward: RewardResult } | { error: StepError } {
  const uh = state.userHustles.find((u) => u.id === userHustleId && u.status === 'active');
  if (!uh) return { error: 'hustle_not_active' };
  const steps = roadmap.phases.flatMap((p) => p.steps);
  const index = steps.findIndex((s) => s.id === stepId);
  if (index === -1) return { error: 'step_not_found' };
  const doneIds = new Set(state.progress.stepProgress.filter((s) => s.user_hustle_id === uh.id).map((s) => s.step_id));
  if (doneIds.has(stepId)) return { error: 'already_done' };
  if (steps.slice(0, index).some((s) => !doneIds.has(s.id))) return { error: 'step_locked' };

  const before = state.profile;
  const xp = Math.min(500, Math.max(0, steps[index].xp));
  let next: EngineState = {
    ...state,
    profile: addXp(state.profile, xp),
    progress: {
      ...state.progress,
      stepProgress: [...state.progress.stepProgress, { user_hustle_id: uh.id, step_id: stepId, completed_at: new Date(now).toISOString() }],
    },
  };
  const activity = recordActivity(next, now);
  next = activity.state;

  const want: BadgeId[] = ['first_step'];
  doneIds.add(stepId);
  const completed = steps.every((s) => doneIds.has(s.id)) && !uh.completed_at;
  if (completed) {
    want.push('roadmap_complete');
    next = {
      ...next,
      userHustles: next.userHustles.map((u) => (u.id === uh.id ? { ...u, completed_at: new Date(now).toISOString() } : u)),
    };
  }
  const badges = awardBadges(next.progress, want, now);
  next = { ...next, progress: badges.progress };
  return { state: next, reward: summary(before, next, xp, activity.xp, [...badges.awarded, ...activity.badges], completed) };
}

export function previewSubmitCheckin(
  state: EngineState,
  input: Omit<CheckinInput, 'screenshots'> & { screenshotPaths: string[] },
  rates: Rates,
  now: number,
): { state: EngineState; reward: RewardResult } | { error: CheckinError } {
  const uh = state.userHustles.find((u) => u.id === input.userHustleId && u.status === 'active');
  if (!uh) return { error: 'hustle_not_active' };
  const week = checkinWeekAt(new Date(uh.started_at), now);
  if (week < 1) return { error: 'checkin_not_open' };
  if (state.progress.checkins.some((c) => c.user_hustle_id === uh.id && c.week_number === week)) return { error: 'checkin_already_done' };
  if (!(input.revenue >= 0) || !(input.costs >= 0)) return { error: 'invalid_amount' };

  const previous = state.progress.checkins.filter((c) => c.user_hustle_id === uh.id).map((c) => c.created_at);
  const since = previous.length ? previous.sort().at(-1)! : uh.started_at;
  const completedSteps = state.progress.stepProgress
    .filter((s) => s.user_hustle_id === uh.id && s.completed_at >= since)
    .sort((a, b) => a.completed_at.localeCompare(b.completed_at))
    .map((s) => s.step_id);

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const row: CheckinRow = {
    id: `preview-checkin-${now}`,
    user_hustle_id: uh.id,
    week_number: week,
    summary: null,
    feeling: input.feeling,
    revenue: round2(input.revenue),
    costs: round2(input.costs),
    currency: input.currency,
    revenue_usd: round2(toUsd(input.revenue, input.currency, rates)),
    costs_usd: round2(toUsd(input.costs, input.currency, rates)),
    hours: input.hours,
    metrics: input.metrics,
    blockers: input.blockers.trim() || null,
    motivation: input.motivation,
    next_week_plan: input.nextWeekPlan.trim() || null,
    screenshot_paths: input.screenshotPaths.slice(0, 5),
    completed_steps: completedSteps,
    created_at: new Date(now).toISOString(),
  };

  const before = state.profile;
  let next: EngineState = {
    ...state,
    profile: addXp(state.profile, XP_PER_CHECKIN),
    progress: { ...state.progress, checkins: [...state.progress.checkins, row] },
  };
  const activity = recordActivity(next, now);
  next = activity.state;

  const allCheckins = next.progress.checkins;
  const want: BadgeId[] = ['first_checkin'];
  if (input.revenue > 0) want.push('first_sale');
  const revenueUsd = allCheckins.reduce((sum, c) => sum + (c.revenue_usd ?? 0), 0);
  if (revenueUsd >= 100) want.push('first_100');
  const badges = awardBadges(next.progress, want, now);
  next = {
    ...next,
    progress: badges.progress,
    profile: { ...next.profile, rank: rankForProfitUsd(profitUsd(allCheckins, rates)) },
  };
  return { state: next, reward: { ...summary(before, next, XP_PER_CHECKIN, activity.xp, [...badges.awarded, ...activity.badges], false), week } };
}
