import keys from './metricKeys.json';

/**
 * Weekly metrics a roadmap can ask for in the check-in (its
 * "weekly_metrics" list). Labels live in the translation files under
 * "metrics". An unknown key from an AI-made roadmap is shown as-is.
 */
export const METRIC_KEYS = keys as readonly string[];

export type MetricKey =
  | 'sales'
  | 'listings'
  | 'shop_visits'
  | 'views'
  | 'subscribers'
  | 'followers'
  | 'videos_published'
  | 'watch_hours'
  | 'issues_published'
  | 'pins_published'
  | 'clicks'
  | 'articles_published'
  | 'search_clicks'
  | 'titles_published'
  | 'reviews'
  | 'leads'
  | 'proposals_sent'
  | 'clients'
  | 'pitches_sent'
  | 'videos_delivered'
  | 'calls_booked'
  | 'files_uploaded'
  | 'downloads';

export const isMetricKey = (key: string): key is MetricKey => METRIC_KEYS.includes(key);

/** "shop_visits" → "Shop visits" for keys the app doesn't know yet. */
export const humanizeMetric = (key: string) => {
  const text = key.replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};
