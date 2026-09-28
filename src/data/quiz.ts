import type { Hustle } from './hustles';
import { traitsFor } from './hustles';

/**
 * Onboarding questions (one per screen). Answers are saved to
 * `profiles.quiz` as JSON and personalize the roadmap and coach.
 * Labels live in the translation files under `quiz.<id>.<option>`.
 */

export type HoursBand = 'lt5' | '5to10' | '10to20' | '20plus';
export type Budget = 'zero' | 'lt50' | 'lt200' | '200plus';
export type Skill = 'design' | 'writing' | 'video' | 'tech' | 'sales' | 'social' | 'none';
export type Equipment = 'computer' | 'phone';
export type IncomeGoal = 'g100' | 'g500' | 'g1000' | 'g3000';
export type FirstEarnings = 'weeks2' | 'month1' | 'months3' | 'norush';
export type Why = 'debt' | 'savings' | 'freedom' | 'comfort' | 'build' | 'other';
export type OnCamera = 'yes' | 'maybe' | 'no';
export type ClientsPref = 'yes' | 'sometimes' | 'no';
export type Experience = 'none' | 'some' | 'experienced';
export type Audience = 'none' | 'small' | 'medium' | 'large';
export type Risk = 'low' | 'medium' | 'high';
export type Employment = 'employed' | 'parttime' | 'student' | 'between' | 'selfemployed' | 'other';
export type QuizCurrency = 'USD' | 'EUR' | 'PLN' | 'GBP';
export type Source = 'tiktok' | 'instagram' | 'youtube' | 'appstore' | 'friend' | 'other';

export interface QuizAnswers {
  version: 1;
  hours: HoursBand;
  budget: Budget;
  skills: Skill[];
  equipment: Equipment;
  incomeGoal: IncomeGoal;
  firstEarnings: FirstEarnings;
  why: Why[];
  onCamera: OnCamera;
  clients: ClientsPref;
  experience: Experience;
  audience: Audience;
  risk: Risk;
  employment: Employment;
  runsBusiness: boolean;
  currency: QuizCurrency;
  source: Source | null;
  referralCode: string | null;
  completedAt: string;
}

export type QuizDraft = Partial<Omit<QuizAnswers, 'version' | 'completedAt'>>;

export type QuestionId =
  | 'hours'
  | 'budget'
  | 'skills'
  | 'equipment'
  | 'incomeGoal'
  | 'firstEarnings'
  | 'why'
  | 'onCamera'
  | 'clients'
  | 'experience'
  | 'audience'
  | 'risk'
  | 'employment'
  | 'currency'
  | 'source'
  | 'referral';

export interface Question {
  id: QuestionId;
  kind: 'single' | 'multi' | 'text';
  options: string[];
  /** Option that clears all others in a multi-select (e.g. "none yet"). */
  exclusive?: string;
  optional?: boolean;
}

export const QUESTIONS: Question[] = [
  { id: 'hours', kind: 'single', options: ['lt5', '5to10', '10to20', '20plus'] },
  { id: 'budget', kind: 'single', options: ['zero', 'lt50', 'lt200', '200plus'] },
  { id: 'skills', kind: 'multi', options: ['design', 'writing', 'video', 'tech', 'sales', 'social', 'none'], exclusive: 'none' },
  { id: 'equipment', kind: 'single', options: ['computer', 'phone'] },
  { id: 'incomeGoal', kind: 'single', options: ['g100', 'g500', 'g1000', 'g3000'] },
  { id: 'firstEarnings', kind: 'single', options: ['weeks2', 'month1', 'months3', 'norush'] },
  { id: 'why', kind: 'multi', options: ['debt', 'savings', 'freedom', 'comfort', 'build', 'other'] },
  { id: 'onCamera', kind: 'single', options: ['yes', 'maybe', 'no'] },
  { id: 'clients', kind: 'single', options: ['yes', 'sometimes', 'no'] },
  { id: 'experience', kind: 'single', options: ['none', 'some', 'experienced'] },
  { id: 'audience', kind: 'single', options: ['none', 'small', 'medium', 'large'] },
  { id: 'risk', kind: 'single', options: ['low', 'medium', 'high'] },
  { id: 'employment', kind: 'single', options: ['employed', 'parttime', 'student', 'between', 'selfemployed', 'other'] },
  { id: 'currency', kind: 'single', options: ['USD', 'EUR', 'PLN', 'GBP'] },
  { id: 'source', kind: 'single', options: ['tiktok', 'instagram', 'youtube', 'appstore', 'friend', 'other'], optional: true },
  { id: 'referral', kind: 'text', options: [], optional: true },
];

export const QUESTION_COUNT = QUESTIONS.length;

/** Upper bound of each answer, used for the fit check. */
export const HOURS_MAX: Record<HoursBand, number> = { lt5: 5, '5to10': 10, '10to20': 20, '20plus': 40 };
export const HOURS_LABEL: Record<HoursBand, string> = { lt5: '<5', '5to10': '5–10', '10to20': '10–20', '20plus': '20+' };
export const BUDGET_MAX_USD: Record<Budget, number> = { zero: 0, lt50: 50, lt200: 200, '200plus': Number.POSITIVE_INFINITY };
export const GOAL_TARGET_USD: Record<IncomeGoal, number> = { g100: 100, g500: 500, g1000: 1000, g3000: 3000 };

/** Reads a stored quiz (JSON from the database) safely. */
export function parseQuiz(value: unknown): QuizAnswers | null {
  if (!value || typeof value !== 'object') return null;
  const q = value as Partial<QuizAnswers>;
  return q.version === 1 && typeof q.hours === 'string' ? (q as QuizAnswers) : null;
}

/** Is the answer for this question filled in (or optional)? */
export function isAnswered(question: Question, draft: QuizDraft): boolean {
  if (question.optional) return true;
  switch (question.id) {
    case 'skills':
      return (draft.skills?.length ?? 0) > 0;
    case 'why':
      return (draft.why?.length ?? 0) > 0;
    case 'referral':
      return true;
    default:
      return draft[question.id] != null;
  }
}

/**
 * Honest "how it fits you" check shown after a draw. Compares what the
 * hustle needs with the quiz answers. It never changes what the machine draws.
 */
export function fitCheck(hustle: Hustle, quiz: QuizAnswers) {
  const traits = traitsFor(hustle.slug);
  const hoursOk = hustle.hours[0] <= HOURS_MAX[quiz.hours];
  const budgetOk = hustle.startupCost[0] <= BUDGET_MAX_USD[quiz.budget];
  const skillsOk = traits.skills.some((s) => quiz.skills.includes(s));
  return {
    hoursOk,
    budgetOk,
    skillsOk,
    score: [hoursOk, budgetOk, skillsOk].filter(Boolean).length,
    warnings: {
      computer: traits.needsComputer && quiz.equipment === 'phone',
      camera: traits.onCamera && quiz.onCamera === 'no',
      clients: traits.clientFacing && quiz.clients === 'no',
    },
  };
}
