import { router, usePathname } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { isBadgeId, type BadgeId } from '@/data/badges';
import type { Rank } from '@/lib/database.types';
import { useHaptics } from '@/lib/haptics';
import { rankIndex, type RewardResult } from '@/lib/progression';
import { loadJSON, saveJSON } from '@/lib/storage';

import { useAccount } from './AccountProvider';
import { useProgressData } from './ProgressProvider';

/**
 * Celebrations.
 *  • Small: a "+XP" toast (level-ups and new badges included) after an
 *    action, via celebrate(reward).
 *  • Badges earned elsewhere (e.g. First Spin when choosing) get their own
 *    toast.
 *  • Full screen: rank-up and roadmap completion open /celebration as soon
 *    as the user is back on a main screen.
 * What was already celebrated is remembered per user on this device.
 */

export interface RewardToastItem {
  id: number;
  xp: number;
  levelUp: number | null;
  badges: BadgeId[];
}

interface Seen {
  rank: Rank;
  badges: string[];
  roadmaps: string[];
}

interface RewardsContextValue {
  celebrate: (reward: RewardResult) => void;
  toasts: RewardToastItem[];
  dismissToast: (id: number) => void;
}

const RewardsContext = createContext<RewardsContextValue | null>(null);
const seenKey = (userId: string) => `chosen.seen.${userId}`;
const TAB_ROUTES = ['/today', '/roadmap', '/coach', '/progress', '/profile'];
const canCelebrateOn = (path: string) => TAB_ROUTES.includes(path) || path.startsWith('/task/');

let nextToastId = 1;

export function RewardsProvider({ children }: { children: ReactNode }) {
  const { userId, profile, userHustles } = useAccount();
  const progress = useProgressData();
  const pathname = usePathname();
  const haptics = useHaptics();
  const [toasts, setToasts] = useState<RewardToastItem[]>([]);
  const [stored, setStored] = useState<{ userId: string; seen: Seen | null } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    loadJSON<Seen>(seenKey(userId)).then((seen) => {
      if (!cancelled) setStored({ userId, seen });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loaded = !!userId && stored?.userId === userId;
  const seen = loaded ? stored.seen : null;

  const current: Seen | null =
    profile && progress.ready
      ? {
          rank: profile.rank,
          badges: progress.userBadges.map((b) => b.badge_id),
          roadmaps: userHustles.filter((u) => u.completed_at).map((u) => u.id),
        }
      : null;

  const saveSeen = useCallback(
    (update: (prev: Seen) => Seen) => {
      if (!userId) return;
      setStored((prev) => {
        if (!prev || prev.userId !== userId || !prev.seen) return prev;
        const next = update(prev.seen);
        saveJSON(seenKey(userId), next);
        return { userId, seen: next };
      });
    },
    [userId],
  );

  const pushToast = useCallback(
    (toast: Omit<RewardToastItem, 'id'>) => {
      haptics('success');
      setToasts((prev) => [...prev, { ...toast, id: nextToastId++ }]);
    },
    [haptics],
  );

  // First time on this device for this user: remember what they already
  // have, so nothing from the past gets celebrated again.
  const currentKey = current ? JSON.stringify(current) : '';
  useEffect(() => {
    if (!loaded || seen || !currentKey || !userId) return;
    const timer = setTimeout(() => {
      const snapshot = JSON.parse(currentKey) as Seen;
      saveJSON(seenKey(userId), snapshot);
      setStored({ userId, seen: snapshot });
    }, 0);
    return () => clearTimeout(timer);
  }, [loaded, seen, currentKey, userId]);

  // Badges earned without a toast yet (e.g. First Spin + Chosen when
  // choosing). A short delay lets celebrate() claim them first.
  const unseenBadges = seen && current ? current.badges.filter((b) => !seen.badges.includes(b)) : [];
  const unseenKey = unseenBadges.join(',');
  useEffect(() => {
    if (!unseenKey) return;
    const timer = setTimeout(() => {
      const ids = unseenKey.split(',');
      saveSeen((prev) => ({ ...prev, badges: [...new Set([...prev.badges, ...ids])] }));
      const badges = ids.filter(isBadgeId);
      if (badges.length) pushToast({ xp: 0, levelUp: null, badges });
    }, 1500);
    return () => clearTimeout(timer);
  }, [unseenKey, saveSeen, pushToast]);

  // Rank-up and finished roadmaps → full-screen celebration.
  const rankNow = current?.rank;
  const rankSeen = seen?.rank;
  const newRoadmap = seen && current ? current.roadmaps.find((id) => !seen.roadmaps.includes(id)) : undefined;
  useEffect(() => {
    if (!rankNow || !rankSeen) return;
    const up = rankIndex(rankNow) > rankIndex(rankSeen);
    const down = rankIndex(rankNow) < rankIndex(rankSeen);
    if (down) {
      const timer = setTimeout(() => saveSeen((prev) => ({ ...prev, rank: rankNow })), 0);
      return () => clearTimeout(timer);
    }
    if ((!up && !newRoadmap) || !canCelebrateOn(pathname)) return;
    const timer = setTimeout(() => {
      if (up) {
        saveSeen((prev) => ({ ...prev, rank: rankNow }));
        router.push({ pathname: '/celebration', params: { kind: 'rank', from: rankSeen, to: rankNow } });
      } else if (newRoadmap) {
        saveSeen((prev) => ({ ...prev, roadmaps: [...prev.roadmaps, newRoadmap] }));
        router.push({ pathname: '/celebration', params: { kind: 'roadmap', uh: newRoadmap } });
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [rankNow, rankSeen, newRoadmap, pathname, saveSeen]);

  const value = useMemo<RewardsContextValue>(
    () => ({
      toasts,
      dismissToast: (id) => setToasts((prev) => prev.filter((t) => t.id !== id)),
      celebrate: (reward) => {
        const badges = reward.newBadges.filter(isBadgeId);
        if (badges.length) saveSeen((prev) => ({ ...prev, badges: [...new Set([...prev.badges, ...badges])] }));
        const levelUp = reward.levelAfter > reward.levelBefore ? reward.levelAfter : null;
        if (reward.xpGained > 0 || badges.length || levelUp) pushToast({ xp: reward.xpGained, levelUp, badges });
      },
    }),
    [toasts, saveSeen, pushToast],
  );

  return <RewardsContext.Provider value={value}>{children}</RewardsContext.Provider>;
}

export function useRewards(): RewardsContextValue {
  const ctx = useContext(RewardsContext);
  if (!ctx) throw new Error('useRewards must be used inside RewardsProvider');
  return ctx;
}
