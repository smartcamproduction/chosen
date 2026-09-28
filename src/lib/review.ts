import * as StoreReview from 'expo-store-review';
import { Platform } from 'react-native';

import { loadJSON, saveJSON } from './storage';

/**
 * The native "Rate this app" prompt (StoreKit on iPhone), shown only right
 * after a positive moment. Never linked to a reward of any kind, and never
 * preceded by our own "Do you like the app?" question (Apple's rules).
 *
 * On top of Apple's own limit (3 times a year) we ask at most once every
 * 90 days. In development builds and TestFlight Apple shows it without
 * sending a real rating (TestFlight doesn't show it at all).
 */
export type ReviewMoment = 'rank_up' | 'first_earnings' | 'roadmap_complete';

const KEY = 'chosen.review';
const DAY_MS = 86_400_000;
const MIN_GAP_DAYS = 90;
const MAX_PER_YEAR = 3;

interface ReviewLog {
  asked: { at: string; moment: ReviewMoment }[];
}

let pending = false;

/** Call after the positive moment has been shown (e.g. the celebration closed). */
export function askForReviewAfter(moment: ReviewMoment, delayMs = 900): void {
  if (Platform.OS === 'web' || pending) return;
  pending = true;
  setTimeout(() => {
    ask(moment)
      .catch(() => {})
      .finally(() => {
        pending = false;
      });
  }, delayMs);
}

async function ask(moment: ReviewMoment): Promise<void> {
  const now = Date.now();
  const log = (await loadJSON<ReviewLog>(KEY)) ?? { asked: [] };
  const lastYear = log.asked.filter((a) => now - Date.parse(a.at) < 365 * DAY_MS);
  if (lastYear.length >= MAX_PER_YEAR) return;
  if (lastYear.some((a) => now - Date.parse(a.at) < MIN_GAP_DAYS * DAY_MS)) return;
  if (!(await StoreReview.isAvailableAsync())) return;
  await saveJSON(KEY, { asked: [...lastYear, { at: new Date(now).toISOString(), moment }] } satisfies ReviewLog);
  await StoreReview.requestReview();
}
