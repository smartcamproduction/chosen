import { loadJSON, saveJSON } from './storage';
import { supabase } from './supabase';

/**
 * Every spin is logged to the `spins` table. Spins are first saved on the
 * device, then sent in batches, so none are lost when the phone is offline
 * or the hustle list hasn't loaded from the server yet.
 */

interface QueuedSpin {
  slug: string;
  userId: string | null;
  at: string;
}

const KEY = 'chosen.queue.spins';
const MAX_QUEUED = 300;
let flushing = false;

const same = (a: QueuedSpin, b: QueuedSpin) => a.slug === b.slug && a.at === b.at && a.userId === b.userId;

export async function queueSpin(spin: QueuedSpin): Promise<void> {
  const queue = (await loadJSON<QueuedSpin[]>(KEY)) ?? [];
  queue.push(spin);
  await saveJSON(KEY, queue.slice(-MAX_QUEUED));
}

/**
 * Sends queued spins. `idForSlug` maps a hustle slug to its database id
 * (unknown until the list has loaded from the server; those spins wait).
 * Spins made while signed in as someone else are sent without a user.
 */
export async function flushSpins(currentUserId: string | null, idForSlug: (slug: string) => string | undefined): Promise<void> {
  if (!supabase || flushing) return;
  flushing = true;
  try {
    const queue = (await loadJSON<QueuedSpin[]>(KEY)) ?? [];
    const ready = queue.filter((s) => idForSlug(s.slug));
    if (ready.length === 0) return;

    const { error } = await supabase.from('spins').insert(
      ready.map((s) => ({
        hustle_id: idForSlug(s.slug)!,
        user_id: s.userId && s.userId === currentUserId ? s.userId : null,
        created_at: s.at,
      })),
    );
    if (error) return; // keep them and try again next time

    // Remove only what was sent (new spins may have been queued meanwhile).
    const latest = (await loadJSON<QueuedSpin[]>(KEY)) ?? [];
    await saveJSON(
      KEY,
      latest.filter((s) => !ready.some((r) => same(r, s))),
    );
  } catch {
    // Offline or similar: the spins stay queued.
  } finally {
    flushing = false;
  }
}
