import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Linking, Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesOffering, type PurchasesStoreProduct } from 'react-native-purchases';

import { useLanguage } from '@/i18n/LanguageProvider';
import { callFunction } from '@/lib/ai';
import { track, type EventProps } from '@/lib/analytics';
import type { Tier } from '@/lib/database.types';
import {
  catalogFromOffering,
  fallbackCatalog,
  fallbackOneTime,
  findOneTime,
  PRODUCT_IDS,
  MESSAGES_PACK,
  type Billing,
  type OneTimeItem,
  type OneTimePrice,
  type PaidTier,
  type PlanCatalog,
} from '@/lib/plans';
import { connectStore, disconnectStore, purchaseFailure, storeConnected, storeSetup, tierFromCustomerInfo, type PurchaseFailure } from '@/lib/purchases';

import { useAccount, type AccountSnapshot } from './AccountProvider';
import { useApp } from './AppState';

/**
 * Purchases: prices from RevenueCat Offerings, the App Store purchase
 * sheet, Restore Purchases and "Manage subscription".
 *
 * After every purchase the app asks the server (sync-purchases) to check
 * with RevenueCat; the plan and credits only change on the server. The
 * revenuecat-webhook does the same on its own, so nothing is lost if the
 * app is closed right after paying.
 *
 * Modes
 *   store / test_store – real purchases (App Store / RevenueCat Test Store)
 *   preview            – no backend yet: purchases are simulated on this device
 *   unavailable        – backend connected, but no store here (web, Expo Go
 *                        without a test key, or no RevenueCat key in .env)
 */

export type PurchasesMode = 'store' | 'test_store' | 'preview' | 'unavailable';
export type PurchaseOutcome = { ok: true; confirmed: boolean } | { ok: false; reason: PurchaseFailure };
export type RestoreOutcome = { ok: true; tier: Tier } | { ok: false; reason: PurchaseFailure };

interface StoreData {
  userId: string;
  failed: boolean;
  offering: PurchasesOffering | null;
  offerings: PurchasesOffering[];
  products: PurchasesStoreProduct[];
  /** productId → the user can get the free trial. */
  eligibility: Record<string, boolean>;
  customer: CustomerInfo | null;
}

interface PurchasesContextValue {
  mode: PurchasesMode;
  /** Store prices are on their way. */
  loading: boolean;
  /** The store's prices couldn't be loaded (offline, or offerings not set up). */
  loadFailed: boolean;
  /** true when prices come from the store (false = preview prices). */
  realPrices: boolean;
  catalog: PlanCatalog;
  oneTime: Record<OneTimeItem, OneTimePrice>;
  isTrialEligible: (productId: string) => boolean;
  /** What the store says on this phone (null until known). */
  storeTier: Tier | null;
  buyPlan: (tier: PaidTier, billing: Billing) => Promise<PurchaseOutcome>;
  buyOneTime: (item: OneTimeItem) => Promise<PurchaseOutcome>;
  restore: () => Promise<RestoreOutcome>;
  manage: () => Promise<void>;
  reload: () => void;
}

const PurchasesContext = createContext<PurchasesContextValue | null>(null);

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, elite: 2 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const INTRO = Purchases.INTRO_ELIGIBILITY_STATUS;

/** The last automatic plan check (store ≠ server), at most once a minute. */
let lastAutoSync = 0;

async function loadStore(userId: string): Promise<Omit<StoreData, 'userId' | 'failed'>> {
  await connectStore(userId);
  const [offerings, products, customer] = await Promise.all([
    Purchases.getOfferings(),
    Purchases.getProducts([PRODUCT_IDS.fast_pivot, PRODUCT_IDS.messages], Purchases.PRODUCT_CATEGORY.NON_SUBSCRIPTION).catch(() => [] as PurchasesStoreProduct[]),
    Purchases.getCustomerInfo().catch(() => null),
  ]);
  const offering = offerings.current;
  const catalog = catalogFromOffering(offering);

  // Apple only gives a free trial once per subscription group.
  const eligibility: Record<string, boolean> = {};
  if (catalog && Platform.OS === 'ios') {
    const ids = (['pro', 'elite'] as const).flatMap((t) =>
      (['monthly', 'yearly'] as const).map((b) => catalog.plans[t][b]).filter((p) => !!p && p.trialDays > 0).map((p) => p!.productId),
    );
    if (ids.length) {
      const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(ids).catch(() => ({}) as Record<string, { status: number }>);
      const neverSubscribed = !customer || customer.allPurchasedProductIdentifiers.length === 0;
      for (const id of ids) {
        const status = result[id]?.status;
        eligibility[id] = status === INTRO.INTRO_ELIGIBILITY_STATUS_ELIGIBLE || (status !== INTRO.INTRO_ELIGIBILITY_STATUS_INELIGIBLE && neverSubscribed);
      }
    }
  }
  return { offering, offerings: Object.values(offerings.all), products, eligibility, customer };
}

export function PurchasesProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const { update } = useApp();
  const { language } = useLanguage();
  const { mode: accountMode, userId } = account;

  const setup = storeSetup();
  const mode: PurchasesMode = accountMode === 'preview' ? 'preview' : setup.mode === 'none' ? 'unavailable' : setup.mode;
  const storeActive = mode === 'store' || mode === 'test_store';

  const [store, setStore] = useState<StoreData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Latest account functions for async callbacks.
  const refreshRef = useRef(account.refresh);
  useEffect(() => {
    refreshRef.current = account.refresh;
  });

  // Connect RevenueCat to the signed-in user, load prices, follow changes.
  useEffect(() => {
    if (!storeActive || !userId) return;
    let cancelled = false;
    let listener: ((info: CustomerInfo) => void) | null = null;
    loadStore(userId).then(
      (data) => {
        if (cancelled) return;
        setStore({ userId, failed: !data.offering, ...data });
        listener = (info) => setStore((prev) => (prev && prev.userId === userId ? { ...prev, customer: info } : prev));
        Purchases.addCustomerInfoUpdateListener(listener);
      },
      (e) => {
        if (__DEV__) console.warn('[purchases] could not load the store', e);
        if (!cancelled) setStore({ userId, failed: true, offering: null, offerings: [], products: [], eligibility: {}, customer: null });
      },
    );
    return () => {
      cancelled = true;
      if (listener) Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [storeActive, userId, reloadKey]);

  // Signed out → RevenueCat forgets the user on this phone.
  useEffect(() => {
    if (!userId && storeConnected()) disconnectStore();
  }, [userId]);

  const data = store && store.userId === userId ? store : null;
  const customer = data?.customer ?? null;
  const storeTier = customer ? tierFromCustomerInfo(customer) : null;
  const serverTier = account.profile?.tier ?? null;

  // The store and the server disagree (e.g. a webhook is late or the plan
  // just expired): ask the server to check again.
  useEffect(() => {
    if (!storeActive || !userId || !storeTier || !serverTier || storeTier === serverTier) return;
    if (Date.now() - lastAutoSync < 60_000) return;
    lastAutoSync = Date.now();
    callFunction('sync-purchases', {}).then((r) => {
      if (r.ok) refreshRef.current().catch(() => {});
    });
  }, [storeActive, userId, storeTier, serverTier]);

  const value = useMemo<PurchasesContextValue>(() => {
    const realCatalog = storeActive ? catalogFromOffering(data?.offering ?? null) : null;
    const catalog = realCatalog ?? fallbackCatalog(language);
    const oneTimeFor = (item: OneTimeItem) =>
      (storeActive && data ? findOneTime(item, data.products, data.offerings) : null) ?? fallbackOneTime(item, language);
    const oneTime = { fast_pivot: oneTimeFor('fast_pivot'), messages: oneTimeFor('messages') };

    /** Asks the server to check with RevenueCat, then waits a little for it to show up. */
    const confirmOnServer = async (check: (snap: AccountSnapshot) => boolean): Promise<boolean> => {
      await callFunction('sync-purchases', {});
      let snap = await refreshRef.current();
      for (let i = 0; i < 4 && !check(snap); i++) {
        await sleep(2500);
        snap = await refreshRef.current();
      }
      return check(snap);
    };

    /** trial_started for a free trial, purchase for everything paid. */
    const trackPurchase = (price: { productId: string; price: number; currency: string }, props: EventProps, trial: boolean) => {
      const base = { product: price.productId, currency: price.currency, ...props };
      if (trial) track('trial_started', base);
      else track('purchase', { ...base, price: price.price });
    };

    const buyPlan: PurchasesContextValue['buyPlan'] = async (tier, billing) => {
      const shown = catalog.plans[tier][billing];
      const trial = !!shown && shown.trialDays > 0 && (realCatalog ? (data?.eligibility[shown.productId] ?? true) : true);
      if (mode === 'preview') {
        account.previewTools?.setPlan(tier);
        if (__DEV__) update({ devTier: null });
        if (shown) trackPurchase(shown, { kind: 'subscription', tier, billing, confirmed: true, preview: true }, trial);
        return { ok: true, confirmed: true };
      }
      const plan = realCatalog?.plans[tier][billing];
      if (!storeActive || !plan?.pkg) return { ok: false, reason: 'unavailable' };
      try {
        await Purchases.purchasePackage(plan.pkg);
      } catch (e) {
        return { ok: false, reason: purchaseFailure(e) };
      }
      if (__DEV__) update({ devTier: null });
      const confirmed = await confirmOnServer((snap) => TIER_RANK[snap.profile?.tier ?? 'free'] >= TIER_RANK[tier]);
      trackPurchase(plan, { kind: 'subscription', tier, billing, confirmed }, trial);
      return { ok: true, confirmed };
    };

    const buyOneTime: PurchasesContextValue['buyOneTime'] = async (item) => {
      const before = item === 'fast_pivot' ? account.fastPivotCredits : account.bonusMessages;
      const price = oneTime[item];
      if (mode === 'preview') {
        if (item === 'fast_pivot') account.previewTools?.addFastPivotCredit();
        else account.previewTools?.addBonusMessages(MESSAGES_PACK);
        trackPurchase(price, { kind: item, confirmed: true, preview: true }, false);
        return { ok: true, confirmed: true };
      }
      if (!storeActive || (!price.product && !price.pkg)) return { ok: false, reason: 'unavailable' };
      try {
        if (price.pkg) await Purchases.purchasePackage(price.pkg);
        else await Purchases.purchaseStoreProduct(price.product!);
      } catch (e) {
        return { ok: false, reason: purchaseFailure(e) };
      }
      const confirmed = await confirmOnServer((snap) => (item === 'fast_pivot' ? snap.fastPivotCredits : snap.bonusMessages) > before);
      trackPurchase(price, { kind: item, confirmed }, false);
      return { ok: true, confirmed };
    };

    const restore: PurchasesContextValue['restore'] = async () => {
      if (mode === 'preview') {
        track('restore', { tier: account.profile?.tier ?? 'free', found: account.profile?.tier !== 'free' });
        return { ok: true, tier: account.profile?.tier ?? 'free' };
      }
      if (!storeActive) return { ok: false, reason: 'unavailable' };
      try {
        await Purchases.restorePurchases();
      } catch (e) {
        return { ok: false, reason: purchaseFailure(e) };
      }
      await callFunction('sync-purchases', {});
      const snap = await refreshRef.current();
      const tier = snap.profile?.tier ?? 'free';
      track('restore', { tier, found: tier !== 'free' });
      return { ok: true, tier };
    };

    const manage = async () => {
      if (storeActive && storeConnected() && Platform.OS !== 'web') {
        try {
          await Purchases.showManageSubscriptions();
          return;
        } catch {
          // Fall back to the store's subscription page.
        }
      }
      const url =
        customer?.managementURL ??
        (Platform.OS === 'android' ? 'https://play.google.com/store/account/subscriptions' : 'https://apps.apple.com/account/subscriptions');
      await Linking.openURL(url).catch(() => {});
    };

    return {
      mode,
      loading: storeActive && !!userId && !data,
      loadFailed: storeActive && !!data && !realCatalog,
      realPrices: !!realCatalog,
      catalog,
      oneTime,
      isTrialEligible: (productId) => (realCatalog ? (data?.eligibility[productId] ?? true) : true),
      storeTier,
      buyPlan,
      buyOneTime,
      restore,
      manage,
      reload: () => {
        setStore(null);
        setReloadKey((k) => k + 1);
      },
    };
  }, [mode, storeActive, userId, data, customer, storeTier, language, account, update]);

  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
}

export function usePurchases(): PurchasesContextValue {
  const ctx = useContext(PurchasesContext);
  if (!ctx) throw new Error('usePurchases must be used inside PurchasesProvider');
  return ctx;
}
