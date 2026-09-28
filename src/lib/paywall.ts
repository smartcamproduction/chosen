import { router } from 'expo-router';

import type { OneTimeItem, PaidTier } from './plans';

/**
 * Where the paywall was opened from. It picks the line under the title and
 * can preselect Elite (second slot, coach styles).
 *   onboarding     – right after locking in the first hustle
 *   coach          – a Free user opened the Coach tab
 *   first_checkin  – after the first weekly check-in
 *   second_slot    – Elite: a second hustle at the same time
 *   personality    – Elite: coach styles
 *   profile/roadmap/today/task/celebration – upgrade buttons
 */
export const PAYWALL_SOURCES = [
  'onboarding',
  'coach',
  'first_checkin',
  'second_slot',
  'personality',
  'profile',
  'roadmap',
  'today',
  'task',
  'celebration',
  'promo',
  'dev',
] as const;
export type PaywallSource = (typeof PAYWALL_SOURCES)[number];

export const isPaywallSource = (v: unknown): v is PaywallSource => typeof v === 'string' && (PAYWALL_SOURCES as readonly string[]).includes(v);

export function openPaywall(source: PaywallSource, plan?: PaidTier): void {
  router.push({ pathname: '/paywall', params: plan ? { source, plan } : { source } });
}

/** Fast Pivot or the 100-message pack. */
export function openOneTimePurchase(item: OneTimeItem): void {
  router.push({ pathname: '/paywall', params: { item } });
}

const shownThisSession = new Set<PaywallSource>();

/** Opens the paywall only the first time in this app session (e.g. the Coach tab). */
export function openPaywallOncePerSession(source: PaywallSource): boolean {
  if (shownThisSession.has(source)) return false;
  shownThisSession.add(source);
  openPaywall(source);
  return true;
}
