import type { CheckinRow } from './database.types';

/**
 * Money helpers. Check-ins are saved in the user's currency and in USD
 * (converted by the server with the exchange_rates table). Ranks use USD;
 * screens show the user's own currency.
 */

/** Units of each currency per 1 USD. */
export type Rates = Record<string, number>;

/** ECB rates of 2026-09-27. Replaced by the database rates when online. */
export const DEFAULT_RATES: Rates = { USD: 1, EUR: 0.87734, GBP: 0.75448, PLN: 3.843 };

const rateOf = (currency: string, rates: Rates) => rates[currency] ?? DEFAULT_RATES[currency] ?? 1;

export const toUsd = (amount: number, currency: string, rates: Rates) => amount / rateOf(currency, rates);
export const fromUsd = (usd: number, currency: string, rates: Rates) => usd * rateOf(currency, rates);

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

/** A check-in's revenue, costs and net in the currency shown on screen. */
export function checkinAmounts(c: CheckinRow, currency: string, rates: Rates) {
  if (c.currency === currency) {
    const revenue = num(c.revenue);
    const costs = num(c.costs);
    return { revenue, costs, net: revenue - costs };
  }
  const revenueUsd = c.revenue_usd != null ? num(c.revenue_usd) : toUsd(num(c.revenue), c.currency, rates);
  const costsUsd = c.costs_usd != null ? num(c.costs_usd) : toUsd(num(c.costs), c.currency, rates);
  const revenue = fromUsd(revenueUsd, currency, rates);
  const costs = fromUsd(costsUsd, currency, rates);
  return { revenue, costs, net: revenue - costs };
}

/** All-time profit in USD (what ranks are based on). */
export function profitUsd(checkins: CheckinRow[], rates: Rates): number {
  return checkins.reduce((sum, c) => {
    const revenue = c.revenue_usd != null ? num(c.revenue_usd) : toUsd(num(c.revenue), c.currency, rates);
    const costs = c.costs_usd != null ? num(c.costs_usd) : toUsd(num(c.costs), c.currency, rates);
    return sum + revenue - costs;
  }, 0);
}

/** Sum of check-in amounts in the shown currency. */
export function totals(checkins: CheckinRow[], currency: string, rates: Rates) {
  return checkins.reduce(
    (acc, c) => {
      const a = checkinAmounts(c, currency, rates);
      return { revenue: acc.revenue + a.revenue, costs: acc.costs + a.costs, net: acc.net + a.net, hours: acc.hours + num(c.hours) };
    },
    { revenue: 0, costs: 0, net: 0, hours: 0 },
  );
}
