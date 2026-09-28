import affiliateFile from '@/data/roadmaps/affiliate-links.json';
import type { Language } from '@/i18n';

import type { L10n } from './l10n';

/**
 * The roadmap format used everywhere (database, AI-personalized roadmaps,
 * the app). One roadmap = one hustle in one language.
 */
export interface RoadmapResource {
  title: string;
  url: string;
}

export interface RoadmapTool {
  name: string;
  url: string;
  affiliate: boolean;
}

export interface RoadmapStep {
  id: string;
  title: string;
  why: string;
  instructions: string[];
  est_minutes: number;
  resources: RoadmapResource[];
  tools: RoadmapTool[];
  xp: number;
  metric_to_track: string;
}

export interface RoadmapPhase {
  id: string;
  title: string;
  goal: string;
  weeks: string;
  steps: RoadmapStep[];
}

export interface EarningMilestone {
  label: string;
  range: string;
  note: string;
}

export interface Roadmap {
  hustle_slug: string;
  locale: Language;
  total_weeks: number;
  phases: RoadmapPhase[];
  weekly_metrics: string[];
  earning_milestones: EarningMilestone[];
}

/** The bilingual files in src/data/roadmaps (both languages side by side). */
export interface RoadmapSource {
  hustle_slug: string;
  total_weeks: number;
  weekly_metrics: string[];
  phases: {
    id: string;
    weeks: string;
    title: L10n;
    goal: L10n;
    steps: {
      id: string;
      xp: number;
      est_minutes: number;
      title: L10n;
      why: L10n;
      instructions: { en: string[]; pl: string[] };
      metric_to_track: L10n;
      resources: { title: L10n; url: string }[];
      tools: RoadmapTool[];
    }[];
  }[];
  earning_milestones: { label: L10n; range: L10n; note: L10n }[];
}

const affiliateLinks: Record<string, string> = affiliateFile.links;

/** One language of a bilingual roadmap (same as scripts/generate-phase4-seed.js). */
export function localizeRoadmap(src: RoadmapSource, locale: Language): Roadmap {
  const pick = (v: L10n) => v[locale];
  return {
    hustle_slug: src.hustle_slug,
    locale,
    total_weeks: src.total_weeks,
    phases: src.phases.map((p) => ({
      id: p.id,
      title: pick(p.title),
      goal: pick(p.goal),
      weeks: p.weeks,
      steps: p.steps.map((s) => ({
        id: s.id,
        title: pick(s.title),
        why: pick(s.why),
        instructions: s.instructions[locale],
        est_minutes: s.est_minutes,
        resources: s.resources.map((r) => ({ title: pick(r.title), url: r.url })),
        tools: s.tools.map((t) => {
          const link = (affiliateLinks[t.name] ?? '').trim();
          return link ? { name: t.name, url: link, affiliate: true } : { name: t.name, url: t.url, affiliate: t.affiliate };
        }),
        xp: s.xp,
        metric_to_track: pick(s.metric_to_track),
      })),
    })),
    weekly_metrics: src.weekly_metrics,
    earning_milestones: src.earning_milestones.map((m) => ({ label: pick(m.label), range: pick(m.range), note: pick(m.note) })),
  };
}

// ---------------------------------------------------------------------
// Reading roadmaps from the database (or an AI-personalized one) safely.
// ---------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const int = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isHttp = (url: string) => /^https?:\/\//i.test(url);

/** Returns a clean roadmap, or null if the JSON isn't a usable roadmap. */
export function parseRoadmap(json: unknown): Roadmap | null {
  if (!isObj(json)) return null;
  const phases: RoadmapPhase[] = list(json.phases)
    .filter(isObj)
    .map((p, pi) => ({
      id: str(p.id) || `p${pi + 1}`,
      title: str(p.title),
      goal: str(p.goal),
      weeks: str(p.weeks),
      steps: list(p.steps)
        .filter(isObj)
        .filter((s) => str(s.id) && str(s.title))
        .map((s) => ({
          id: str(s.id),
          title: str(s.title),
          why: str(s.why),
          instructions: list(s.instructions).map(str).filter(Boolean),
          est_minutes: Math.max(0, int(s.est_minutes, 30)),
          resources: list(s.resources)
            .filter(isObj)
            .map((r) => ({ title: str(r.title), url: str(r.url) }))
            .filter((r) => r.title && isHttp(r.url)),
          tools: list(s.tools)
            .filter(isObj)
            .map((t) => ({ name: str(t.name), url: str(t.url), affiliate: t.affiliate === true }))
            .filter((t) => t.name && isHttp(t.url)),
          xp: Math.max(0, int(s.xp, 0)),
          metric_to_track: str(s.metric_to_track),
        })),
    }))
    .filter((p) => p.steps.length > 0);
  if (phases.length === 0) return null;
  return {
    hustle_slug: str(json.hustle_slug),
    locale: json.locale === 'pl' ? 'pl' : 'en',
    total_weeks: Math.max(1, int(json.total_weeks, 12)),
    phases,
    weekly_metrics: list(json.weekly_metrics).map(str).filter(Boolean).slice(0, 6),
    earning_milestones: list(json.earning_milestones)
      .filter(isObj)
      .map((m) => ({ label: str(m.label), range: str(m.range), note: str(m.note) }))
      .filter((m) => m.label),
  };
}

// ---------------------------------------------------------------------
// Progress through a roadmap. Steps unlock in order: the first step that
// isn't done is the current one; everything after it is locked.
// ---------------------------------------------------------------------

export type StepState = 'done' | 'current' | 'locked';

export interface FlatStep extends RoadmapStep {
  phase: RoadmapPhase;
  phaseIndex: number;
  /** Position in the whole roadmap (0-based). */
  index: number;
  state: StepState;
}

export interface RoadmapView {
  roadmap: Roadmap;
  steps: FlatStep[];
  total: number;
  doneCount: number;
  xpDone: number;
  xpTotal: number;
  current: FlatStep | null;
  /** The next open steps (the current one first). */
  upNext: FlatStep[];
  complete: boolean;
  phaseStates: StepState[];
  currentPhaseIndex: number;
  byId: (id: string | undefined) => FlatStep | undefined;
}

export function buildRoadmapView(roadmap: Roadmap, doneIds: Iterable<string>): RoadmapView {
  const done = new Set(doneIds);
  let currentFound = false;
  const steps: FlatStep[] = [];
  roadmap.phases.forEach((phase, phaseIndex) => {
    for (const step of phase.steps) {
      let state: StepState;
      if (done.has(step.id)) state = 'done';
      else if (!currentFound) {
        state = 'current';
        currentFound = true;
      } else state = 'locked';
      steps.push({ ...step, phase, phaseIndex, index: steps.length, state });
    }
  });

  const phaseStates = roadmap.phases.map((_, i): StepState => {
    const own = steps.filter((s) => s.phaseIndex === i);
    if (own.every((s) => s.state === 'done')) return 'done';
    if (own.some((s) => s.state === 'current')) return 'current';
    return own.some((s) => s.state === 'done') ? 'current' : 'locked';
  });

  const current = steps.find((s) => s.state === 'current') ?? null;
  const doneSteps = steps.filter((s) => s.state === 'done');
  return {
    roadmap,
    steps,
    total: steps.length,
    doneCount: doneSteps.length,
    xpDone: doneSteps.reduce((sum, s) => sum + s.xp, 0),
    xpTotal: steps.reduce((sum, s) => sum + s.xp, 0),
    current,
    upNext: steps.filter((s) => s.state !== 'done').slice(0, 3),
    complete: steps.length > 0 && doneSteps.length === steps.length,
    phaseStates,
    currentPhaseIndex: current ? current.phaseIndex : Math.max(0, roadmap.phases.length - 1),
    byId: (id) => steps.find((s) => s.id === id),
  };
}

/** "3-5" → [3, 5]; "4" → [4, 4]. */
export function parseWeeks(weeks: string): [number, number] {
  const [a, b] = weeks.split('-').map((n) => parseInt(n, 10));
  const from = Number.isFinite(a) ? a : 1;
  return [from, Number.isFinite(b) ? b : from];
}

/** "45 min" / "1.5 h" style duration pieces. */
export function durationParts(minutes: number): { value: number; unit: 'min' | 'h' } {
  if (minutes < 60) return { value: minutes, unit: 'min' };
  return { value: Math.round((minutes / 60) * 10) / 10, unit: 'h' };
}
