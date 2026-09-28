import type { LucideIcon } from 'lucide-react-native';

import type { HustleRow } from '@/lib/database.types';
import { iconByName } from '@/lib/icons';
import type { L10n } from '@/lib/l10n';

import type { Skill } from './quiz';
import seed from './hustles.seed.json';

/**
 * A side hustle as the app uses it. The source of truth is the Supabase
 * `hustles` table; `hustles.seed.json` is the same data bundled in the app
 * so the machine still works offline or before the backend is set up.
 */
export interface Hustle {
  id: string;
  slug: string;
  number: number;
  icon: LucideIcon;
  name: L10n;
  summary: L10n;
  earningRange: L10n;
  /** Typical monthly range in USD once it's running (for the chip), if known. */
  earningMonthly: [number, number] | null;
  hours: [number, number];
  startupCost: [number, number];
  /** 1 (easiest) … 5 (hardest) */
  difficulty: number;
  /** true when loaded from the database (has a real id that can be committed to) */
  fromServer: boolean;
}

type HustleInput = Omit<HustleRow, 'id' | 'is_active' | 'earning_min_usd' | 'earning_max_usd'> & {
  id?: string;
  earning_min_usd?: number | null;
  earning_max_usd?: number | null;
};

export function toHustle(row: HustleInput, index: number, fromServer: boolean): Hustle {
  return {
    id: row.id ?? row.slug,
    slug: row.slug,
    number: index + 1,
    icon: iconByName(row.icon),
    name: { en: row.name_en, pl: row.name_pl },
    summary: { en: row.summary_en, pl: row.summary_pl },
    earningRange: { en: row.earning_range_en, pl: row.earning_range_pl },
    earningMonthly: row.earning_min_usd != null && row.earning_max_usd != null ? [row.earning_min_usd, row.earning_max_usd] : null,
    hours: [row.hours_per_week_min, row.hours_per_week_max],
    startupCost: [row.startup_cost_min, row.startup_cost_max],
    difficulty: row.difficulty,
    fromServer,
  };
}

export const SEED_HUSTLES: Hustle[] = seed.map((row, i) => toHustle(row, i, false));

export type DifficultyLabel = 'easy' | 'medium' | 'hard';

export function difficultyLabel(level: number): DifficultyLabel {
  if (level <= 2) return 'easy';
  if (level === 3) return 'medium';
  return 'hard';
}

/**
 * What each hustle leans on. Used only for the honest "how it fits you"
 * check after a draw; it never influences which hustle the machine picks.
 */
export interface HustleTraits {
  skills: Exclude<Skill, 'none'>[];
  needsComputer: boolean;
  onCamera: boolean;
  clientFacing: boolean;
}

const DEFAULT_TRAITS: HustleTraits = { skills: [], needsComputer: true, onCamera: false, clientFacing: false };

export const HUSTLE_TRAITS: Record<string, HustleTraits> = {
  'print-on-demand': { skills: ['design'], needsComputer: true, onCamera: false, clientFacing: false },
  'etsy-digital-products': { skills: ['design'], needsComputer: true, onCamera: false, clientFacing: false },
  'notion-canva-templates': { skills: ['design', 'tech'], needsComputer: true, onCamera: false, clientFacing: false },
  'faceless-youtube': { skills: ['video', 'writing'], needsComputer: true, onCamera: false, clientFacing: false },
  'faceless-short-video': { skills: ['video', 'social'], needsComputer: false, onCamera: false, clientFacing: false },
  newsletter: { skills: ['writing'], needsComputer: true, onCamera: false, clientFacing: false },
  'pinterest-affiliate': { skills: ['design', 'social'], needsComputer: false, onCamera: false, clientFacing: false },
  'niche-affiliate-blog': { skills: ['writing', 'tech'], needsComputer: true, onCamera: false, clientFacing: false },
  'amazon-kdp': { skills: ['writing', 'design'], needsComputer: true, onCamera: false, clientFacing: false },
  'mini-course': { skills: ['video', 'writing'], needsComputer: true, onCamera: true, clientFacing: false },
  'ai-freelancing': { skills: ['writing', 'design', 'video', 'tech'], needsComputer: true, onCamera: false, clientFacing: true },
  'ugc-creator': { skills: ['video', 'social'], needsComputer: false, onCamera: true, clientFacing: true },
  'ai-automations': { skills: ['tech', 'sales'], needsComputer: true, onCamera: false, clientFacing: true },
  'stock-media': { skills: ['design', 'video'], needsComputer: false, onCamera: false, clientFacing: false },
  'social-media-manager': { skills: ['social', 'design'], needsComputer: false, onCamera: false, clientFacing: true },
};

export const traitsFor = (slug: string): HustleTraits => HUSTLE_TRAITS[slug] ?? DEFAULT_TRAITS;
