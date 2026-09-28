import { useCallback, useEffect, useState } from 'react';

import { callFunction, coachLimit, usageMonth, type AiErrorCode, type CoachUsage } from '@/lib/ai';
import { track } from '@/lib/analytics';
import { uploadCoachImages, type PickedImage } from '@/lib/checkin';
import type { CoachMessageRow } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import { useAccount } from './AccountProvider';
import { useNow } from './hooks';
import { useProgressData } from './ProgressProvider';

/**
 * The AI coach chat (Pro / Elite). Messages and the monthly allowance come
 * from the database; sending goes through the coach-chat Edge Function.
 * Check-ins from the last 8 days without the coach's analysis are sent to
 * checkin-feedback automatically (e.g. if the app was closed right after).
 */

export type ChatItem = Pick<CoachMessageRow, 'id' | 'role' | 'kind' | 'content' | 'image_paths' | 'checkin_id' | 'created_at'> & {
  status?: 'sending' | 'failed';
  localImages?: PickedImage[];
};

const FEEDBACK_MAX_AGE_MS = 8 * 86_400_000;
const REVIEW_WINDOW_MS = 3 * 60_000;
/** Check-ins already sent for analysis in this app session. */
const requested = new Set<string>();

/** Ask the coach to analyse a check-in (Pro / Elite). Safe to call twice. */
export async function requestCheckinFeedback(checkinId: string): Promise<void> {
  if (requested.has(checkinId)) return;
  requested.add(checkinId);
  const result = await callFunction('checkin-feedback', { checkin_id: checkinId });
  if (!result.ok && result.error !== 'tier_required' && result.error !== 'consent_required') requested.delete(checkinId);
}

export function useCoach() {
  const { mode, userId, profile, bonusMessages } = useAccount();
  const { checkins } = useProgressData();
  const now = useNow();
  const serverTier = profile?.tier ?? 'free';
  const canUse = mode === 'supabase' && !!userId && (serverTier === 'pro' || serverTier === 'elite') && !!profile?.ai_consent_at;

  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [usage, setUsage] = useState<CoachUsage | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState<AiErrorCode | null>(null);

  // Reloads when the bonus balance changes (e.g. after buying 100 messages).
  const fetchAll = useCallback(async () => {
    if (mode !== 'supabase' || !supabase || !userId) return null;
    const [msgs, usageRow, creditsRow] = await Promise.all([
      supabase
        .from('coach_messages')
        .select('id, role, kind, content, image_paths, checkin_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('ai_usage').select('messages_used').eq('user_id', userId).eq('month', usageMonth()).maybeSingle(),
      supabase.from('credits').select('bonus_messages').eq('user_id', userId).maybeSingle(),
    ]);
    return {
      messages: msgs.data ? [...msgs.data].reverse() : null,
      usage: { used: usageRow.data?.messages_used ?? 0, bonus: creditsRow.data?.bonus_messages ?? bonusMessages, limit: coachLimit(serverTier) },
    };
  }, [mode, userId, serverTier, bonusMessages]);

  const apply = (result: Awaited<ReturnType<typeof fetchAll>>) => {
    if (result?.messages) {
      const fromServer = result.messages;
      setMessages((prev) => [...fromServer, ...prev.filter((m) => m.status)]);
    }
    if (result) setUsage(result.usage);
    setLoaded(true);
  };

  const load = () => fetchAll().then(apply);

  useEffect(() => {
    let cancelled = false;
    fetchAll().then(
      (result) => {
        if (!cancelled) apply(result);
      },
      () => {
        if (!cancelled) setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
    // `apply` only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAll]);

  // Recent check-ins still waiting for the coach's analysis.
  const missingFeedback = checkins.filter(
    (c) =>
      now - new Date(c.created_at).getTime() < FEEDBACK_MAX_AGE_MS &&
      !messages.some((m) => m.kind === 'checkin_feedback' && m.checkin_id === c.id),
  );
  const missingKey = missingFeedback.map((c) => c.id).join(',');
  const [requestedAt, setRequestedAt] = useState(0);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (!canUse || !loaded || !missingKey) return;
    const ids = missingKey.split(',').filter((id) => !requested.has(id));
    if (ids.length === 0) return;
    Promise.all(ids.map((id) => requestCheckinFeedback(id)))
      .then(() => {
        setRequestedAt(Date.now());
        return fetchAll();
      })
      .then(apply)
      .catch(() => {});
    // `apply` only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUse, loaded, missingKey, fetchAll]);

  // "Coach is reviewing your check-in…" while an analysis is on its way
  // (for up to 3 minutes after it was requested).
  const time = Math.max(now, clock);
  const reviewing =
    canUse &&
    missingFeedback.length > 0 &&
    (time - requestedAt < REVIEW_WINDOW_MS ||
      missingFeedback.some((c) =>
        messages.some((m) => m.kind === 'checkin' && m.checkin_id === c.id && time - new Date(m.created_at).getTime() < REVIEW_WINDOW_MS),
      ));
  useEffect(() => {
    if (!reviewing) return;
    const timer = setInterval(() => {
      setClock(Date.now());
      fetchAll()
        .then(apply)
        .catch(() => {});
    }, 5000);
    const stop = setTimeout(() => {
      clearInterval(timer);
      setClock(Date.now());
    }, REVIEW_WINDOW_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
    // `apply` only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing, fetchAll]);

  const send = async (text: string, images: PickedImage[] = []): Promise<boolean> => {
    const trimmed = text.trim();
    if (!canUse || !userId || sending || (!trimmed && images.length === 0)) return false;
    const tempId = `local-${Date.now()}`;
    setMessages((prev) => [
      ...prev.filter((m) => m.status !== 'failed'),
      {
        id: tempId,
        role: 'user',
        kind: 'chat',
        content: trimmed,
        image_paths: [],
        checkin_id: null,
        created_at: new Date().toISOString(),
        status: 'sending',
        localImages: images,
      },
    ]);
    setSending(true);
    setLastError(null);

    let paths: string[] = [];
    try {
      paths = await uploadCoachImages(userId, images);
    } catch {
      setSending(false);
      setLastError('offline');
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
      return false;
    }

    const result = await callFunction<{ user_message: ChatItem; message: ChatItem; usage: CoachUsage }>('coach-chat', {
      message: trimmed,
      image_paths: paths,
    });
    setSending(false);
    if (result.ok) {
      setMessages((prev) => [...prev.filter((m) => m.id !== tempId), result.data.user_message, result.data.message]);
      setUsage(result.data.usage);
      const u = result.data.usage;
      track('coach_message_sent', {
        tier: serverTier,
        images: images.length,
        from_bonus: !!u && u.used >= u.limit,
      });
      return true;
    }
    setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
    setLastError(result.error);
    if (result.error === 'limit_reached') {
      track('coach_limit_reached', { tier: serverTier, limit: Number(result.details.limit ?? coachLimit(serverTier)) });
      setUsage({
        used: Number(result.details.used ?? 0),
        limit: Number(result.details.limit ?? coachLimit(serverTier)),
        bonus: Number(result.details.bonus ?? 0),
      });
    }
    return false;
  };

  const retry = (item: ChatItem) => {
    setMessages((prev) => prev.filter((m) => m.id !== item.id));
    return send(item.content, item.localImages ?? []);
  };

  // Plan messages first, then the bonus balance (never expires).
  const limitReached = !!usage && usage.limit > 0 && usage.used >= usage.limit && usage.bonus <= 0;

  return {
    canUse,
    loaded,
    messages,
    usage,
    sending,
    reviewing,
    limitReached,
    lastError,
    clearError: () => setLastError(null),
    send,
    retry,
    reload: load,
  };
}
