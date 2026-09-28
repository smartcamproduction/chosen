import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ReelItem } from '@/components/SlotReels';
import { difficultyLabel, type Hustle } from '@/data/hustles';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useHustles } from '@/state/HustlesProvider';

import { formatMoney } from './format';
import { useHaptics } from './haptics';
import { useL } from './l10n';
import { stripLength } from './reelPhysics';
import { preloadSounds, useSounds } from './sounds';

const REELS = 3;
const TICK_MIN_GAP_MS = 60;

/** Random hustle indexes; the second-to-last row is the target. */
function buildStrip(reel: number, target: number, count: number): number[] {
  const length = stripLength(reel);
  const strip = Array.from({ length }, () => Math.floor(Math.random() * count));
  strip[length - 2] = target;
  return strip;
}

export type MachinePhase = 'idle' | 'spinning' | 'done';

/** Uniformly random pick among the given hustles (each equally likely). */
export function pickRandomIndex(count: number): number {
  return Math.floor(Math.random() * count);
}

/**
 * Slot machine logic. The result is picked uniformly at random from the
 * active hustles; all three reels then land on that same hustle.
 * Reel 1 = hustle, reel 2 = weekly time, reel 3 = start-up cost.
 *
 * Feedback: medium impact + lever sound on pull, light ticks while
 * spinning, heavy impact + thunk as each reel stops, success + chime on
 * the result.
 */
export function useMachine(onResult?: (hustle: Hustle) => void) {
  const { t } = useTranslation();
  const l = useL();
  const { language } = useLanguage();
  const { hustles } = useHustles();
  const haptics = useHaptics();
  const sound = useSounds();
  const count = hustles.length;
  const [strips, setStrips] = useState<number[][]>(() =>
    Array.from({ length: REELS }, (_, i) => [i % count, (i + 3) % count, (i + 7) % count]),
  );
  const [spinKey, setSpinKey] = useState(0);
  const [phase, setPhase] = useState<MachinePhase>('idle');
  const [resultIndex, setResultIndex] = useState<number | null>(null);
  const target = useRef<number | null>(null);
  const lastTick = useRef(0);

  useEffect(() => {
    preloadSounds();
  }, []);

  const spin = () => {
    if (phase === 'spinning' || count === 0) return;
    const next = pickRandomIndex(count);
    target.current = next;
    setStrips(Array.from({ length: REELS }, (_, reel) => buildStrip(reel, next, count)));
    setSpinKey((k) => k + 1);
    setPhase('spinning');
    haptics('medium');
    sound('pull');
  };

  const onTick = () => {
    const now = Date.now();
    if (now - lastTick.current < TICK_MIN_GAP_MS) return;
    lastTick.current = now;
    haptics('light');
    sound('tick');
  };

  const onReelStop = () => {
    haptics('heavy');
    sound('stop');
  };

  const onSettled = () => {
    setPhase('done');
    setResultIndex(target.current);
    haptics('success');
    sound('win');
    const hustle = target.current != null ? hustles[target.current] : undefined;
    if (hustle) onResult?.(hustle);
  };

  const usd = (n: number) => formatMoney(n, 'USD', language, { decimals: 0 });
  const cost = (h: Hustle) => (h.startupCost[1] === 0 ? usd(0) : `${usd(h.startupCost[0])}–${usd(h.startupCost[1])}`);

  const itemFor = (h: Hustle, column: number): ReelItem => {
    if (column === 0) return { label: l(h.name) };
    if (column === 1) return { label: `${h.hours[0]}–${h.hours[1]} h`, sub: t('common.perWeek') };
    return { label: cost(h), sub: t(`difficulty.${difficultyLabel(h.difficulty)}`) };
  };

  return {
    phase,
    spinKey,
    spin,
    onTick,
    onReelStop,
    onSettled,
    reelStrips: strips.map((strip, column) => strip.map((idx) => itemFor(hustles[idx % count], column))),
    result: phase === 'done' && resultIndex != null ? hustles[resultIndex] : null,
  };
}
