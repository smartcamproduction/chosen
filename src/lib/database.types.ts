/**
 * TypeScript description of the Supabase tables the app uses.
 * Mirrors the SQL files in supabase/migrations (Phases 2–6).
 * (Later this can be generated with `npx supabase gen types typescript`.)
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Tier = 'free' | 'pro' | 'elite';
export type CoachPersonality = 'balanced' | 'buddy' | 'strict' | 'consultant';
export type Rank = 'rookie' | 'starter' | 'earner' | 'operator' | 'mogul';
export type HustleStatus = 'active' | 'completed' | 'abandoned';

export type ProfileRow = {
  id: string;
  display_name: string | null;
  locale: 'en' | 'pl' | null;
  country: string | null;
  currency: string;
  age_confirmed_at: string | null;
  ai_consent_at: string | null;
  analytics_consent: boolean;
  quiz: Json | null;
  tier: Tier;
  coach_personality: CoachPersonality;
  xp: number;
  level: number;
  rank: Rank;
  streak_current: number;
  streak_best: number;
  last_active_date: string | null;
  /** IANA time zone (e.g. Europe/Warsaw); decides when a day starts for streaks. */
  timezone: string | null;
  notification_time: string | null;
  expo_push_token: string | null;
  sounds_enabled: boolean;
  referral_code: string | null;
  referred_by: string | null;
  is_admin: boolean;
  created_at: string;
  /** Subscription details, written only by the server from RevenueCat (Phase 6). */
  subscription_product: string | null;
  subscription_store: string | null;
  subscription_expires_at: string | null;
  subscription_will_renew: boolean | null;
  subscription_is_trial: boolean;
  /** A gifted month (referral reward or granted in the RevenueCat dashboard). */
  subscription_is_promo: boolean;
  subscription_synced_at: string | null;
  /** When analytics consent was given (set by the database). */
  analytics_consent_at: string | null;
  /** "Offers & news" notifications: a separate, optional opt-in (Phase 7). */
  promo_push_opt_in: boolean;
  promo_push_opt_in_at: string | null;
}

/** Profile fields the app is allowed to change (see column grants in the migration). */
export type ProfileUpdate = Partial<
  Pick<
    ProfileRow,
    | 'display_name'
    | 'locale'
    | 'country'
    | 'currency'
    | 'age_confirmed_at'
    | 'ai_consent_at'
    | 'analytics_consent'
    | 'quiz'
    | 'coach_personality'
    | 'notification_time'
    | 'expo_push_token'
    | 'sounds_enabled'
    | 'timezone'
    | 'promo_push_opt_in'
  >
>;

export type HustleRow = {
  id: string;
  slug: string;
  name_en: string;
  name_pl: string;
  summary_en: string;
  summary_pl: string;
  hours_per_week_min: number;
  hours_per_week_max: number;
  startup_cost_min: number;
  startup_cost_max: number;
  earning_range_en: string;
  earning_range_pl: string;
  earning_min_usd: number | null;
  earning_max_usd: number | null;
  difficulty: number;
  icon: string;
  is_active: boolean;
}

export type UserHustleRow = {
  id: string;
  user_id: string;
  hustle_id: string;
  slot: number;
  started_at: string;
  lock_until: string;
  status: HustleStatus;
  personalized_roadmap: Json | null;
  /** Set when every roadmap step is done. */
  completed_at: string | null;
  /** AI personalization (Pro / Elite): pending → done, or failed. */
  personalization_status: 'pending' | 'done' | 'failed' | null;
  personalization_error: string | null;
  personalization_started_at: string | null;
  personalized_at: string | null;
}

export type CoachMessageKind = 'chat' | 'checkin' | 'checkin_feedback' | 'nudge';

export type CoachMessageRow = {
  id: string;
  user_id: string;
  user_hustle_id: string | null;
  role: 'user' | 'assistant' | 'system';
  kind: CoachMessageKind;
  checkin_id: string | null;
  content: string;
  image_paths: string[];
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  model: string | null;
  created_at: string;
}

export type AiUsageRow = {
  user_id: string;
  month: string;
  /** Messages from the plan's monthly allowance. */
  messages_used: number;
  /** Bonus messages used this month (the balance is credits.bonus_messages). */
  bonus_used: number;
  /** No longer used (Phase 5 kept bonus messages per month). */
  bonus_messages: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  ai_calls: number;
}

export type DailyPushRow = {
  id: number;
  user_id: string;
  local_day: string;
  kind: 'motivation' | 'nudge';
  text: string;
  send_at: string | null;
  status: 'pending' | 'sent' | 'failed' | 'skipped' | 'in_app';
  sent_at: string | null;
  error: string | null;
  created_at: string;
}

export type AiJobRow = {
  id: string;
  kind: 'generate_roadmap';
  hustle_id: string | null;
  locale: 'en' | 'pl' | null;
  status: 'running' | 'done' | 'failed';
  error: string | null;
  roadmap_id: string | null;
  requested_by: string | null;
  created_at: string;
  finished_at: string | null;
}

export type RoadmapRow = {
  id: string;
  hustle_id: string;
  locale: 'en' | 'pl';
  version: number;
  status: 'draft' | 'approved';
  content: Json;
  created_at: string;
}

export type StepProgressRow = {
  user_hustle_id: string;
  step_id: string;
  completed_at: string;
}

export type CheckinRow = {
  id: string;
  user_hustle_id: string;
  week_number: number;
  summary: string | null;
  /** Mood 1 (drained) … 5 (on fire). */
  feeling: number | null;
  revenue: number;
  costs: number;
  currency: string;
  revenue_usd: number | null;
  costs_usd: number | null;
  hours: number | null;
  metrics: Json;
  blockers: string | null;
  /** Energy 1–10. */
  motivation: number | null;
  next_week_plan: string | null;
  screenshot_paths: string[];
  completed_steps: string[];
  created_at: string;
}

export type UserBadgeRow = {
  user_id: string;
  badge_id: string;
  earned_at: string;
}

export type ActivityDayRow = {
  user_id: string;
  day: string;
  created_at: string;
}

export type ExchangeRateRow = {
  currency: string;
  usd_rate: number;
  updated_at: string;
}

export type DailyMessageRow = {
  id: number;
  locale: 'en' | 'pl';
  text: string;
}

export type SpinRow = {
  id: number;
  user_id: string | null;
  hustle_id: string;
  chosen: boolean;
  created_at: string;
}

export type CreditsRow = {
  user_id: string;
  fast_pivot_credits: number;
  /** Extra coach messages (bought or referral rewards). Never expire. */
  bonus_messages: number;
}

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      // Insert/update rights are enforced by RLS and column grants on the server.
      profiles: Table<ProfileRow, Partial<ProfileRow>, ProfileUpdate>;
      hustles: Table<HustleRow>;
      user_hustles: Table<UserHustleRow>;
      spins: Table<SpinRow, { user_id?: string | null; hustle_id: string; chosen?: boolean; created_at?: string }>;
      credits: Table<CreditsRow>;
      roadmaps: Table<RoadmapRow>;
      // Written only by the complete_step() / submit_checkin() functions.
      step_progress: Table<StepProgressRow>;
      checkins: Table<CheckinRow>;
      user_badges: Table<UserBadgeRow>;
      activity_days: Table<ActivityDayRow>;
      exchange_rates: Table<ExchangeRateRow>;
      daily_messages: Table<DailyMessageRow>;
      // Written only by the AI Edge Functions (users can read their own rows).
      coach_messages: Table<CoachMessageRow>;
      ai_usage: Table<AiUsageRow>;
      daily_pushes: Table<DailyPushRow>;
      ai_jobs: Table<AiJobRow>;
    };
    Views: { [_ in never]: never };
    Functions: {
      choose_hustle: {
        Args: { p_hustle_id: string; p_slot?: number; p_use_fast_pivot?: boolean; p_replace_current?: boolean };
        Returns: UserHustleRow;
      };
      redeem_referral: {
        Args: { p_code: string };
        Returns: boolean;
      };
      use_fast_pivot: {
        Args: { p_slot?: number };
        Returns: number;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      complete_step: {
        Args: { p_user_hustle_id: string; p_step_id: string };
        Returns: Json;
      };
      submit_checkin: {
        Args: {
          p_user_hustle_id: string;
          p_feeling: number | null;
          p_revenue: number;
          p_costs: number;
          p_currency: string;
          p_hours: number | null;
          p_metrics: Json;
          p_motivation: number | null;
          p_blockers: string;
          p_next_week_plan: string;
          p_screenshot_paths: string[];
        };
        Returns: Json;
      };
      hustle_percentile: {
        Args: { p_user_hustle_id: string };
        Returns: Json;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
