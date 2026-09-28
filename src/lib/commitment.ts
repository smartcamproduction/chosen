import type { Tier, UserHustleRow } from './database.types';

/**
 * What would happen if the user chose this hustle right now.
 *   free     – an empty slot (slot 1, or slot 2 for Elite)
 *   replace  – the 30 days are over (or its roadmap is finished); switching
 *              is free but must be confirmed
 *   locked   – still inside the 30-day commitment (Fast Pivot needed)
 *   same     – this hustle is already active
 */
export type ChooseTarget =
  | { kind: 'free'; slot: 1 | 2 }
  | { kind: 'replace'; slot: 1 | 2; current: UserHustleRow }
  | { kind: 'locked'; slot: 1 | 2; current: UserHustleRow; until: Date }
  | { kind: 'same'; slot: 1 | 2 };

const asSlot = (n: number): 1 | 2 => (n === 2 ? 2 : 1);

export function chooseTarget(userHustles: UserHustleRow[], tier: Tier, hustleId: string, now: number): ChooseTarget {
  const active = userHustles.filter((u) => u.status === 'active');
  const slot1 = active.find((u) => u.slot === 1);
  const slot2 = active.find((u) => u.slot === 2);

  const same = active.find((u) => u.hustle_id === hustleId);
  if (same) return { kind: 'same', slot: asSlot(same.slot) };

  if (!slot1) return { kind: 'free', slot: 1 };
  if (tier === 'elite' && !slot2) return { kind: 'free', slot: 2 };

  const occupied = [slot1, slot2].filter((u): u is UserHustleRow => !!u);
  const expired = occupied.find((u) => new Date(u.lock_until).getTime() <= now || !!u.completed_at);
  if (expired) return { kind: 'replace', slot: asSlot(expired.slot), current: expired };

  const soonest = [...occupied].sort((a, b) => new Date(a.lock_until).getTime() - new Date(b.lock_until).getTime())[0];
  return { kind: 'locked', slot: asSlot(soonest.slot), current: soonest, until: new Date(soonest.lock_until) };
}
