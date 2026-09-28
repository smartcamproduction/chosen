import type { Language } from '@/i18n';

export type Currency = 'USD' | 'EUR' | 'PLN' | 'GBP';

const localeFor = (lang: Language) => (lang === 'pl' ? 'pl-PL' : 'en-US');

export function formatMoney(
  amount: number,
  currency: Currency,
  lang: Language,
  opts: { decimals?: number; signed?: boolean } = {},
): string {
  const decimals = opts.decimals ?? 2;
  let out: string;
  try {
    out = new Intl.NumberFormat(localeFor(lang), {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(Math.abs(amount));
  } catch {
    out = `${currency} ${Math.abs(amount).toFixed(decimals)}`;
  }
  if (amount < 0) return `−${out}`;
  if (opts.signed) return `+${out}`;
  return out;
}

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', PLN: 'zł', GBP: '£' };

/** Short symbol for input fields ($, €, zł, £). */
export const currencySymbol = (currency: string) => SYMBOLS[currency] ?? currency;

/** Reads a typed amount ("12,50" or "12.50"). Empty → 0, invalid → null. */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/\s/g, '').replace(',', '.');
  if (!clean) return 0;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function formatNumber(value: number, lang: Language, decimals = 0): string {
  try {
    return new Intl.NumberFormat(localeFor(lang), {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return value.toFixed(decimals);
  }
}

export function formatPercent(fraction: number, lang: Language, decimals = 0): string {
  return `${formatNumber(fraction * 100, lang, decimals)}%`;
}

export function formatDate(date: Date, lang: Language, withYear = false): string {
  try {
    return new Intl.DateTimeFormat(localeFor(lang), {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

export function formatTime(date: Date, lang: Language): string {
  try {
    return new Intl.DateTimeFormat(localeFor(lang), { hour: '2-digit', minute: '2-digit' }).format(date);
  } catch {
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Two-digit index like 01, 02 … used for sequences and hustle numbers. */
export const pad2 = (n: number) => String(n).padStart(2, '0');
