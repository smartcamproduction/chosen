import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { SEED_HUSTLES, toHustle, type Hustle } from '@/data/hustles';
import type { HustleRow } from '@/lib/database.types';
import { loadJSON, saveJSON } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

/**
 * The 15 hustles. Loads from the database (and caches them on the device);
 * falls back to the copy bundled in the app when offline or before the
 * backend is connected.
 */

interface HustlesContextValue {
  hustles: Hustle[];
  /** true once the list came from the database (now or from cache). */
  fromServer: boolean;
  byId: (id: string | null | undefined) => Hustle | undefined;
}

const CACHE_KEY = 'chosen.cache.hustles';
const SEED_ORDER = SEED_HUSTLES.map((h) => h.slug);

function fromRows(rows: HustleRow[]): Hustle[] {
  const order = (slug: string) => {
    const i = SEED_ORDER.indexOf(slug);
    return i === -1 ? 999 : i;
  };
  return [...rows]
    .filter((r) => r.is_active)
    .sort((a, b) => order(a.slug) - order(b.slug) || a.slug.localeCompare(b.slug))
    .map((row, i) => toHustle(row, i, true));
}

const HustlesContext = createContext<HustlesContextValue | null>(null);

export function HustlesProvider({ children }: { children: ReactNode }) {
  const [hustles, setHustles] = useState<Hustle[]>(SEED_HUSTLES);

  useEffect(() => {
    let cancelled = false;
    loadJSON<HustleRow[]>(CACHE_KEY).then((rows) => {
      if (!cancelled && rows?.length) setHustles(fromRows(rows));
    });
    if (supabase) {
      supabase
        .from('hustles')
        .select('*')
        .eq('is_active', true)
        .then(({ data }) => {
          if (cancelled || !data?.length) return;
          setHustles(fromRows(data));
          saveJSON(CACHE_KEY, data);
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<HustlesContextValue>(
    () => ({
      hustles,
      fromServer: hustles[0]?.fromServer ?? false,
      byId: (id) => (id ? hustles.find((h) => h.id === id || h.slug === id) : undefined),
    }),
    [hustles],
  );

  return <HustlesContext.Provider value={value}>{children}</HustlesContext.Provider>;
}

export function useHustles(): HustlesContextValue {
  const ctx = useContext(HustlesContext);
  if (!ctx) throw new Error('useHustles must be used inside HustlesProvider');
  return ctx;
}
