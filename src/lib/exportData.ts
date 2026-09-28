import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { PreviewAccount } from '@/state/AccountProvider';

import { supabase } from './supabase';

/**
 * "Download my data" (GDPR right of access / portability): everything the
 * app stores about the signed-in user, as one JSON file, handed to the
 * share sheet (save to Files, AirDrop, email…). Reads only the user's own
 * rows (the database's security rules enforce that).
 */

const TABLES_BY_USER = [
  'coach_messages',
  'ai_usage',
  'credits',
  'user_badges',
  'activity_days',
  'spins',
  'daily_pushes',
  'purchase_grants',
  'consent_log',
] as const;

export type ExportResult = { ok: true } | { ok: false; error: 'offline' | 'failed' };

async function collectServer(userId: string, email: string | null): Promise<Record<string, unknown>> {
  if (!supabase) throw new Error('not_connected');
  const db = supabase as unknown as {
    from: (t: string) => { select: (c: string) => { eq: (c: string, v: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }> } };
  };
  const [profile, hustles, referralsMade, referralsReceived] = await Promise.all([
    db.from('profiles').select('*').eq('id', userId),
    db.from('user_hustles').select('*').eq('user_id', userId),
    db.from('referrals').select('*').eq('referrer_id', userId),
    db.from('referrals').select('*').eq('referred_id', userId),
  ]);
  const hustleIds = ((hustles.data ?? []) as { id: string }[]).map((h) => h.id);
  const byHustle = async (table: string) => {
    if (!hustleIds.length) return [];
    const { data, error } = await supabase!.from(table as 'checkins').select('*').in('user_hustle_id', hustleIds);
    if (error) throw error;
    return data ?? [];
  };
  const [steps, checkins, ...rest] = await Promise.all([
    byHustle('step_progress'),
    byHustle('checkins'),
    ...TABLES_BY_USER.map(async (table) => {
      const { data, error } = await db.from(table).select('*').eq('user_id', userId);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
  ]);
  for (const r of [profile, hustles, referralsMade, referralsReceived]) if (r.error) throw new Error(r.error.message);

  return {
    account: { user_id: userId, email },
    profile: profile.data?.[0] ?? null,
    hustles: hustles.data ?? [],
    roadmap_steps_done: steps,
    checkins,
    ...Object.fromEntries(TABLES_BY_USER.map((t, i) => [t, rest[i]])),
    referrals: { invited_by_you: referralsMade.data ?? [], your_referral: referralsReceived.data ?? [] },
  };
}

function collectPreview(preview: PreviewAccount): Record<string, unknown> {
  return {
    account: { user_id: 'preview-user', email: null, note: 'Preview mode: data stored on this device only.' },
    profile: preview.profile,
    hustles: preview.userHustles,
    roadmap_steps_done: preview.progress.stepProgress,
    checkins: preview.progress.checkins,
    user_badges: preview.progress.userBadges,
    activity_days: preview.progress.activityDays,
    credits: { fast_pivot_credits: preview.fastPivotCredits, bonus_messages: preview.bonusMessages },
  };
}

export async function exportMyData(opts: {
  userId: string;
  email: string | null;
  preview: PreviewAccount | null;
  shareTitle: string;
}): Promise<ExportResult> {
  let content: Record<string, unknown>;
  try {
    content = opts.preview ? collectPreview(opts.preview) : await collectServer(opts.userId, opts.email);
  } catch (e) {
    return { ok: false, error: /network|fetch|timeout/i.test(String(e)) ? 'offline' : 'failed' };
  }
  const text = JSON.stringify({ app: 'Chosen: Side Hustle Coach', exported_at: new Date().toISOString(), ...content }, null, 2);
  const name = `chosen-my-data-${new Date().toISOString().slice(0, 10)}.json`;

  try {
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      return { ok: true };
    }
    const file = new File(Paths.cache, name);
    file.create({ overwrite: true });
    file.write(text);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: opts.shareTitle });
    return { ok: true };
  } catch {
    return { ok: false, error: 'failed' };
  }
}
