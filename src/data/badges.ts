import { Banknote, CalendarCheck, Dices, Flag, Flame, Footprints, Lock, Rocket, Trophy, type LucideIcon } from 'lucide-react-native';

/**
 * The 9 badges. The server decides when they're earned (see the Phase 4
 * migration); titles and descriptions are in the translation files under
 * "badges".
 */
export const BADGE_IDS = [
  'first_spin',
  'chosen',
  'first_step',
  'streak_7',
  'streak_30',
  'first_checkin',
  'first_sale',
  'first_100',
  'roadmap_complete',
] as const;

export type BadgeId = (typeof BADGE_IDS)[number];

export interface BadgeInfo {
  id: BadgeId;
  icon: LucideIcon;
  tone: 'amber' | 'accent' | 'violet';
}

export const BADGES: BadgeInfo[] = [
  { id: 'first_spin', icon: Dices, tone: 'violet' },
  { id: 'chosen', icon: Lock, tone: 'accent' },
  { id: 'first_step', icon: Footprints, tone: 'accent' },
  { id: 'streak_7', icon: Flame, tone: 'amber' },
  { id: 'streak_30', icon: Rocket, tone: 'amber' },
  { id: 'first_checkin', icon: CalendarCheck, tone: 'violet' },
  { id: 'first_sale', icon: Banknote, tone: 'accent' },
  { id: 'first_100', icon: Trophy, tone: 'amber' },
  { id: 'roadmap_complete', icon: Flag, tone: 'violet' },
];

export const isBadgeId = (id: string): id is BadgeId => (BADGE_IDS as readonly string[]).includes(id);

export const badgeInfo = (id: string) => BADGES.find((b) => b.id === id);
