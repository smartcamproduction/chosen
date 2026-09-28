import type { CheckinRow, ProfileRow, Rank, UserHustleRow } from './database.types';

/**
 * Game rules shown in the app. The server (supabase/migrations/…phase4…)
 * applies exactly the same rules when it hands out XP, streaks and ranks;
 * these copies are used for progress bars and for preview mode.
 */

export const XP_PER_CHECKIN = 50;
export const XP_PER_ACTIVE_DAY = 10;
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------
// Levels: level n needs a total of 100·n^1.5 XP. Everyone starts at 0.
// ---------------------------------------------------------------------

export function xpForLevel(level: number): number {
  return level <= 0 ? 0 : Math.ceil(100 * Math.pow(level, 1.5) - 1e-9);
}

export function levelForXp(xp: number): number {
  let level = Math.max(0, Math.floor(Math.pow(Math.max(0, xp) / 100, 2 / 3)));
  while (xpForLevel(level + 1) <= xp) level += 1;
  while (level > 0 && xpForLevel(level) > xp) level -= 1;
  return level;
}

export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const floorXp = xpForLevel(level);
  const nextXp = xpForLevel(level + 1);
  return { level, nextLevel: level + 1, floorXp, nextXp, fraction: (xp - floorXp) / (nextXp - floorXp) };
}

const LEVEL_KEYS = [
  'levels.0',
  'levels.1',
  'levels.2',
  'levels.3',
  'levels.4',
  'levels.5',
  'levels.6',
  'levels.7',
  'levels.8',
  'levels.9',
] as const;

/** Title for a level (level 9 and above share the last title). */
export function levelKey(level: number) {
  return LEVEL_KEYS[Math.min(LEVEL_KEYS.length - 1, Math.max(0, Math.floor(level)))];
}

// ---------------------------------------------------------------------
// Ranks: all-time profit (revenue − costs) in USD.
// ---------------------------------------------------------------------

export const RANKS: { key: Rank; minUsd: number }[] = [
  { key: 'rookie', minUsd: 0 },
  { key: 'starter', minUsd: 1 },
  { key: 'earner', minUsd: 100 },
  { key: 'operator', minUsd: 1000 },
  { key: 'mogul', minUsd: 10000 },
];

export const rankIndex = (key: Rank) => Math.max(0, RANKS.findIndex((r) => r.key === key));

export function rankForProfitUsd(usd: number): Rank {
  let key: Rank = 'rookie';
  for (const r of RANKS) if (usd >= r.minUsd) key = r.key;
  return key;
}

export const nextRank = (key: Rank) => RANKS[rankIndex(key) + 1] ?? null;

// ---------------------------------------------------------------------
// Days and streaks (the device's calendar day; the server uses the
// time zone saved on the profile, which the app keeps in sync).
// ---------------------------------------------------------------------

export function localDay(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftDay(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + days));
}

export const isActiveToday = (profile: Pick<ProfileRow, 'last_active_date'> | null, now: number) =>
  !!profile?.last_active_date && profile.last_active_date >= localDay(new Date(now));

/** The streak as it stands today: it's broken once a whole day is missed. */
export function effectiveStreak(profile: Pick<ProfileRow, 'last_active_date' | 'streak_current'> | null, now: number): number {
  if (!profile?.last_active_date) return 0;
  const yesterday = shiftDay(localDay(new Date(now)), -1);
  return profile.last_active_date >= yesterday ? profile.streak_current : 0;
}

// ---------------------------------------------------------------------
// Weekly check-ins: check-in N opens on day 7·N of the hustle (day 1 is
// the day it was chosen) and stays open until the next one opens.
// ---------------------------------------------------------------------

export function checkinWeekAt(startedAt: Date, now: number): number {
  const days = Math.floor((now - startedAt.getTime()) / DAY_MS);
  return Math.max(0, Math.floor((days + 1) / 7));
}

export const checkinOpensAt = (startedAt: Date, week: number) => new Date(startedAt.getTime() + (7 * week - 1) * DAY_MS);

export type CheckinState =
  | { kind: 'open'; week: number; closesAt: Date }
  | { kind: 'done'; week: number; nextOpensAt: Date }
  | { kind: 'waiting'; week: number; opensAt: Date };

export function checkinState(userHustle: Pick<UserHustleRow, 'id' | 'started_at'>, checkins: CheckinRow[], now: number): CheckinState {
  const startedAt = new Date(userHustle.started_at);
  const week = checkinWeekAt(startedAt, now);
  if (week < 1) return { kind: 'waiting', week: 1, opensAt: checkinOpensAt(startedAt, 1) };
  const done = checkins.some((c) => c.user_hustle_id === userHustle.id && c.week_number === week);
  if (done) return { kind: 'done', week, nextOpensAt: checkinOpensAt(startedAt, week + 1) };
  return { kind: 'open', week, closesAt: checkinOpensAt(startedAt, week + 1) };
}

// ---------------------------------------------------------------------
// What an action earned (returned by complete_step / submit_checkin).
// ---------------------------------------------------------------------

export interface RewardResult {
  xpGained: number;
  activityXp: number;
  xpTotal: number;
  levelBefore: number;
  levelAfter: number;
  rankBefore: Rank;
  rankAfter: Rank;
  streak: number;
  newBadges: string[];
  roadmapCompleted: boolean;
  week?: number;
  /** Set after a check-in (the coach's analysis is requested for it). */
  checkinId?: string;
}

const RANK_KEYS = new Set<string>(RANKS.map((r) => r.key));
const asRank = (v: unknown): Rank => (typeof v === 'string' && RANK_KEYS.has(v) ? (v as Rank) : 'rookie');
const asNumber = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** Reads the JSON the server sends back after an action. */
export function parseReward(json: unknown): RewardResult | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  return {
    xpGained: asNumber(o.xp_gained),
    activityXp: asNumber(o.activity_xp),
    xpTotal: asNumber(o.xp_total),
    levelBefore: asNumber(o.level_before),
    levelAfter: asNumber(o.level_after),
    rankBefore: asRank(o.rank_before),
    rankAfter: asRank(o.rank_after),
    streak: asNumber(o.streak),
    newBadges: Array.isArray(o.new_badges) ? o.new_badges.filter((b): b is string => typeof b === 'string') : [],
    roadmapCompleted: o.roadmap_completed === true,
    week: o.week == null ? undefined : asNumber(o.week),
    checkinId: typeof o.checkin_id === 'string' ? o.checkin_id : undefined,
  };
}
