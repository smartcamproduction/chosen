import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ROADMAP_SOURCES } from '@/data/roadmaps';
import type { Language } from '@/i18n';
import { callFunction } from '@/lib/ai';
import { localizeRoadmap, parseRoadmap, type Roadmap } from '@/lib/roadmap';
import { loadJSON, saveJSON } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import { useAccount } from './AccountProvider';
import { useHustles } from './HustlesProvider';

/**
 * Base roadmaps. The approved version from the database wins; the copy
 * bundled with the app is used offline, before the backend is connected,
 * or while the database copy is loading.
 */

export type RoadmapSourceKind = 'personalized' | 'server' | 'bundled';

interface RoadmapsContextValue {
  /** Base roadmap for a hustle (by database id and slug) in a language. */
  baseRoadmap: (hustleId: string, slug: string, locale: Language) => { roadmap: Roadmap; source: RoadmapSourceKind } | null;
}

const CACHE_KEY = 'chosen.cache.roadmaps';
const RoadmapsContext = createContext<RoadmapsContextValue | null>(null);

const keyOf = (hustleId: string, locale: Language) => `${hustleId}:${locale}`;

/** Hustles already sent for personalization in this app session. */
const personalizationRequested = new Set<string>();

/** Pro / Elite: ask the server to adapt the roadmap to the user's answers. */
export async function requestPersonalization(userHustleId: string): Promise<boolean> {
  personalizationRequested.add(userHustleId);
  const result = await callFunction('personalize-roadmap', { user_hustle_id: userHustleId });
  return result.ok;
}

export function RoadmapsProvider({ children }: { children: ReactNode }) {
  const { mode, userId, userHustles, profile, refresh } = useAccount();
  const { fromServer } = useHustles();

  // After choosing a hustle or upgrading: personalize once (server plan + AI consent).
  const canPersonalize = mode === 'supabase' && (profile?.tier === 'pro' || profile?.tier === 'elite') && !!profile?.ai_consent_at;
  const toPersonalize = userHustles
    .filter((u) => !u.personalized_roadmap && !u.personalization_status)
    .map((u) => u.id)
    .join(',');
  useEffect(() => {
    if (!canPersonalize || !toPersonalize) return;
    const ids = toPersonalize.split(',').filter((id) => !personalizationRequested.has(id));
    if (ids.length === 0) return;
    Promise.all(ids.map((id) => requestPersonalization(id))).then(() => refresh());
  }, [canPersonalize, toPersonalize, refresh]);

  // While the server is working, check back every 10 seconds (up to 5 minutes after it started).
  const pendingSince =
    userHustles
      .filter((u) => u.personalization_status === 'pending')
      .map((u) => u.personalization_started_at ?? '')
      .sort()[0] ?? null;
  useEffect(() => {
    if (mode !== 'supabase' || pendingSince === null) return;
    const started = pendingSince ? Date.parse(pendingSince) : Date.now();
    const remaining = started + 5 * 60_000 - Date.now();
    if (remaining <= 0) return;
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, 10_000);
    const stop = setTimeout(() => clearInterval(timer), remaining);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [mode, pendingSince, refresh]);
  const [serverRoadmaps, setServerRoadmaps] = useState<Record<string, Roadmap>>({});

  useEffect(() => {
    let cancelled = false;
    loadJSON<Record<string, unknown>>(CACHE_KEY).then((cached) => {
      if (cancelled || !cached) return;
      const parsed: Record<string, Roadmap> = {};
      for (const [key, json] of Object.entries(cached)) {
        const roadmap = parseRoadmap(json);
        if (roadmap) parsed[key] = roadmap;
      }
      setServerRoadmaps((prev) => ({ ...parsed, ...prev }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hustleIdsKey = [...new Set(userHustles.map((u) => u.hustle_id))].sort().join(',');

  // Fetch the approved roadmaps for the user's committed hustles.
  useEffect(() => {
    if (mode !== 'supabase' || !supabase || !userId || !fromServer || !hustleIdsKey) return;
    let cancelled = false;
    supabase
      .from('roadmaps')
      .select('hustle_id, locale, version, content')
      .in('hustle_id', hustleIdsKey.split(','))
      .eq('status', 'approved')
      .order('version', { ascending: false })
      .then(({ data }) => {
        if (cancelled || !data?.length) return;
        const next: Record<string, Roadmap> = {};
        for (const row of data) {
          const key = keyOf(row.hustle_id, row.locale);
          if (next[key]) continue; // newest version first
          const roadmap = parseRoadmap(row.content);
          if (roadmap) next[key] = roadmap;
        }
        setServerRoadmaps((prev) => {
          const merged = { ...prev, ...next };
          saveJSON(CACHE_KEY, merged);
          return merged;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [mode, userId, fromServer, hustleIdsKey]);

  const value = useMemo<RoadmapsContextValue>(
    () => ({
      baseRoadmap: (hustleId, slug, locale) => {
        const fromDb = serverRoadmaps[keyOf(hustleId, locale)] ?? null;
        if (fromDb) return { roadmap: fromDb, source: 'server' };
        const bundled = ROADMAP_SOURCES[slug];
        if (bundled) return { roadmap: localizeRoadmap(bundled, locale), source: 'bundled' };
        const english = serverRoadmaps[keyOf(hustleId, 'en')];
        return english ? { roadmap: english, source: 'server' } : null;
      },
    }),
    [serverRoadmaps],
  );

  return <RoadmapsContext.Provider value={value}>{children}</RoadmapsContext.Provider>;
}

export function useRoadmaps(): RoadmapsContextValue {
  const ctx = useContext(RoadmapsContext);
  if (!ctx) throw new Error('useRoadmaps must be used inside RoadmapsProvider');
  return ctx;
}
