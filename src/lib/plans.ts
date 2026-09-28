import type { PurchasesOffering, PurchasesPackage, PurchasesStoreProduct } from 'react-native-purchases';

import type { Language } from '@/i18n';

/**
 * Plans and prices for the paywall.
 *
 * Real prices always come from the App Store (via RevenueCat Offerings), so
 * prices, trials and A/B tests can change in RevenueCat without an app
 * update. The FALLBACK prices below are only shown where no store exists
 * (preview mode and the web preview).
 */

export type PaidTier = 'pro' | 'elite';
export type Billing = 'monthly' | 'yearly';
export type OneTimeItem = 'fast_pivot' | 'messages';

/** Product ids: the same in App Store Connect and RevenueCat. */
export const PRODUCT_IDS = {
  pro: { monthly: 'chosen_pro_monthly', yearly: 'chosen_pro_yearly' },
  elite: { monthly: 'chosen_elite_monthly', yearly: 'chosen_elite_yearly' },
  fast_pivot: 'chosen_fast_pivot',
  messages: 'chosen_messages_100',
} as const;

/** How many messages the messages pack adds (the server grants the same). */
export const MESSAGES_PACK = 100;

const FALLBACK = {
  currency: 'USD',
  pro: { monthly: 39.99, yearly: 249.99, trialDays: 3 },
  elite: { monthly: 99.99, yearly: 599.99, trialDays: 0 },
  fast_pivot: 29.99,
  messages: 9.99,
};

export interface PlanPrice {
  tier: PaidTier;
  billing: Billing;
  productId: string;
  /** The amount actually billed each period. */
  price: number;
  /** Formatted by the store in the user's currency, e.g. "$249.99" or "1 199,99 zł". */
  priceString: string;
  currency: string;
  /** Monthly equivalent (yearly price / 12). */
  perMonth: number;
  /** Free-trial length offered by the store for this product (0 = none). */
  trialDays: number;
  /** null when prices are the preview fallback. */
  pkg: PurchasesPackage | null;
}

export interface PlanCatalog {
  plans: Record<PaidTier, Partial<Record<Billing, PlanPrice>>>;
  /** Preselected plan (offering metadata "default_plan": "pro" | "elite"). */
  defaultTier: PaidTier;
  /** Preselected billing (offering metadata "default_period": "monthly" | "yearly"). Yearly unless set. */
  defaultBilling: Billing;
  offeringId: string | null;
}

export interface OneTimePrice {
  item: OneTimeItem;
  productId: string;
  price: number;
  priceString: string;
  currency: string;
  /** From the store (null = preview price). */
  product: PurchasesStoreProduct | null;
  /** Set when the product was found in an offering instead. */
  pkg: PurchasesPackage | null;
}

const localeFor = (lang: Language) => (lang === 'pl' ? 'pl-PL' : 'en-US');

/** Formats an amount in any store currency. */
export function formatPrice(amount: number, currency: string, lang: Language): string {
  try {
    return new Intl.NumberFormat(localeFor(lang), { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Free-trial days from the store's introductory offer (paid intro prices are not trials). */
export function trialDaysOf(product: Pick<PurchasesStoreProduct, 'introPrice'>): number {
  const intro = product.introPrice;
  if (!intro || intro.price > 0) return 0;
  const units = Math.max(1, intro.periodNumberOfUnits) * Math.max(1, intro.cycles);
  switch (intro.periodUnit) {
    case 'DAY':
      return units;
    case 'WEEK':
      return units * 7;
    case 'MONTH':
      return units * 30;
    case 'YEAR':
      return units * 365;
    default:
      return 0;
  }
}

/**
 * Which plan a package is. Works with custom package ids (pro_yearly,
 * elite_monthly…) and with the product ids, so a price test with new
 * products (e.g. chosen_pro_yearly_b) needs no app update.
 */
export function classifyPackage(pkg: Pick<PurchasesPackage, 'identifier' | 'packageType' | 'product'>): { tier: PaidTier; billing: Billing } | null {
  const id = `${pkg.identifier} ${pkg.product.identifier}`.toLowerCase();
  const tier: PaidTier | null = /elite/.test(id) ? 'elite' : /(^|[^a-z])pro([^a-z]|$)/.test(id) ? 'pro' : null;
  const type = String(pkg.packageType);
  const period = pkg.product.subscriptionPeriod;
  const billing: Billing | null =
    type === 'ANNUAL' || period === 'P1Y' || /year|annual/.test(id) ? 'yearly' : type === 'MONTHLY' || period === 'P1M' || /month/.test(id) ? 'monthly' : null;
  return tier && billing ? { tier, billing } : null;
}

const meta = (offering: PurchasesOffering, key: string) => {
  const v = offering.metadata?.[key];
  return typeof v === 'string' ? v : undefined;
};

/** The paywall plans from a RevenueCat offering (null if it has none of ours). */
export function catalogFromOffering(offering: PurchasesOffering | null): PlanCatalog | null {
  if (!offering) return null;
  const plans: PlanCatalog['plans'] = { pro: {}, elite: {} };
  let found = 0;
  for (const pkg of offering.availablePackages) {
    const kind = classifyPackage(pkg);
    if (!kind || plans[kind.tier][kind.billing]) continue;
    const p = pkg.product;
    plans[kind.tier][kind.billing] = {
      ...kind,
      productId: p.identifier,
      price: p.price,
      priceString: p.priceString,
      currency: p.currencyCode,
      perMonth: kind.billing === 'yearly' ? (p.pricePerMonth ?? p.price / 12) : p.price,
      trialDays: trialDaysOf(p),
      pkg,
    };
    found += 1;
  }
  if (!found) return null;
  return {
    plans,
    defaultTier: meta(offering, 'default_plan') === 'elite' ? 'elite' : 'pro',
    defaultBilling: meta(offering, 'default_period') === 'monthly' ? 'monthly' : 'yearly',
    offeringId: offering.identifier,
  };
}

/** Preview prices (no store): the planned US prices. */
export function fallbackCatalog(lang: Language): PlanCatalog {
  const plan = (tier: PaidTier, billing: Billing): PlanPrice => {
    const price = FALLBACK[tier][billing];
    return {
      tier,
      billing,
      productId: PRODUCT_IDS[tier][billing],
      price,
      priceString: formatPrice(price, FALLBACK.currency, lang),
      currency: FALLBACK.currency,
      perMonth: billing === 'yearly' ? price / 12 : price,
      trialDays: FALLBACK[tier].trialDays,
      pkg: null,
    };
  };
  return {
    plans: {
      pro: { monthly: plan('pro', 'monthly'), yearly: plan('pro', 'yearly') },
      elite: { monthly: plan('elite', 'monthly'), yearly: plan('elite', 'yearly') },
    },
    defaultTier: 'pro',
    defaultBilling: 'yearly',
    offeringId: null,
  };
}

export function oneTimeFromProduct(item: OneTimeItem, product: PurchasesStoreProduct, pkg: PurchasesPackage | null = null): OneTimePrice {
  return { item, productId: product.identifier, price: product.price, priceString: product.priceString, currency: product.currencyCode, product, pkg };
}

export function fallbackOneTime(item: OneTimeItem, lang: Language): OneTimePrice {
  return {
    item,
    productId: PRODUCT_IDS[item],
    price: FALLBACK[item],
    priceString: formatPrice(FALLBACK[item], FALLBACK.currency, lang),
    currency: FALLBACK.currency,
    product: null,
    pkg: null,
  };
}

/**
 * The one-time products: fetched directly from the store, or (if you put
 * them in an offering in RevenueCat) found in any offering.
 */
export function findOneTime(
  item: OneTimeItem,
  products: PurchasesStoreProduct[],
  offerings: PurchasesOffering[],
): OneTimePrice | null {
  const product = products.find((p) => oneTimeItemOf(p.identifier) === item);
  if (product) return oneTimeFromProduct(item, product);
  for (const offering of offerings) {
    const pkg = offering.availablePackages.find((p) => oneTimeItemOf(p.product.identifier) === item);
    if (pkg) return oneTimeFromProduct(item, pkg.product, pkg);
  }
  return null;
}

/** Which one-time item a store product is (matches e.g. chosen_fast_pivot_b too). */
export function oneTimeItemOf(productId: string): OneTimeItem | null {
  for (const item of ['fast_pivot', 'messages'] as const) {
    const base = PRODUCT_IDS[item];
    if (productId === base || productId.startsWith(`${base}_`)) return item;
  }
  return null;
}

/** "Save 48%": yearly vs. 12 × monthly. */
export function yearlySavings(catalog: PlanCatalog, tier: PaidTier): { percent: number; amount: number } | null {
  const m = catalog.plans[tier].monthly;
  const y = catalog.plans[tier].yearly;
  if (!m || !y || m.price <= 0 || m.currency !== y.currency) return null;
  const amount = m.price * 12 - y.price;
  const percent = Math.round((amount / (m.price * 12)) * 100);
  return percent > 0 ? { percent, amount } : null;
}

/** The biggest yearly saving across plans (for the toggle badge). */
export function bestYearlySaving(catalog: PlanCatalog): number | null {
  const all = (['pro', 'elite'] as const).map((t) => yearlySavings(catalog, t)?.percent ?? 0);
  const best = Math.max(...all);
  return best > 0 ? best : null;
}
