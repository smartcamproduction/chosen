import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';

/**
 * Calls the AI Edge Functions (coach-chat, checkin-feedback,
 * personalize-roadmap, generate-roadmap). The Claude API key lives only on
 * the server; the app sends the user's session token, nothing else.
 */

export type AiErrorCode =
  | 'not_connected'
  | 'not_authenticated'
  | 'tier_required'
  | 'consent_required'
  | 'limit_reached'
  | 'ai_unavailable'
  | 'ai_not_configured'
  | 'ai_refused'
  | 'admin_only'
  | 'offline'
  | 'unknown';

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: AiErrorCode; details: Record<string, unknown> };

const KNOWN: AiErrorCode[] = [
  'not_authenticated',
  'tier_required',
  'consent_required',
  'limit_reached',
  'ai_unavailable',
  'ai_not_configured',
  'ai_refused',
  'admin_only',
];

export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<AiResult<T>> {
  if (!supabase) return { ok: false, error: 'not_connected', details: {} };
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return { ok: true, data: data as T };

  if (error instanceof FunctionsHttpError) {
    const payload = await (error.context as Response)
      .json()
      .catch(() => ({}) as Record<string, unknown>);
    const code = typeof payload?.error === 'string' ? payload.error : '';
    return { ok: false, error: (KNOWN as string[]).includes(code) ? (code as AiErrorCode) : 'unknown', details: payload ?? {} };
  }
  if (error instanceof FunctionsFetchError) return { ok: false, error: 'offline', details: {} };
  return { ok: false, error: 'unknown', details: {} };
}

export interface CoachUsage {
  /** Plan messages used this month (at most `limit`). */
  used: number;
  /** Monthly plan allowance (Pro 150, Elite 400). */
  limit: number;
  /** Bonus messages left (bought or referral rewards; used after the plan's). */
  bonus: number;
}

/** Monthly coach messages per plan (same as coach_message_limit() on the server). */
export const coachLimit = (tier: string) => (tier === 'elite' ? 400 : tier === 'pro' ? 150 : 0);

/** First day of the current month (UTC), the key used by ai_usage. */
export function usageMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** Whole days until the monthly allowance resets. */
export function daysUntilReset(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 86_400_000));
}
