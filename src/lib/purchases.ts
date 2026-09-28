import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import Purchases, { type CustomerInfo, type PurchasesError } from 'react-native-purchases';

import { REVENUECAT_KEYS } from '@/config';

import type { Tier } from './database.types';

/**
 * RevenueCat on the phone: prices and the App Store purchase sheet.
 * The app never decides what a user owns: after a purchase it asks the
 * server (sync-purchases), which checks with RevenueCat using the secret
 * key and updates the plan and credits.
 *
 *   store      – the real App Store / Google Play (TestFlight = sandbox)
 *   test_store – RevenueCat's Test Store (Expo Go, test_ key)
 *   none       – no purchases possible here (web, Expo Go without a test
 *                key, or no key in .env)
 */
export type StoreMode = 'store' | 'test_store' | 'none';

export function storeSetup(): { key: string; mode: StoreMode } {
  if (Platform.OS === 'web') return { key: '', mode: 'none' };
  const test = REVENUECAT_KEYS.test.startsWith('test_') ? REVENUECAT_KEYS.test : '';
  if (isRunningInExpoGo()) return test ? { key: test, mode: 'test_store' } : { key: '', mode: 'none' };
  const key = Platform.OS === 'ios' ? REVENUECAT_KEYS.ios : REVENUECAT_KEYS.android;
  if (key) return { key, mode: 'store' };
  return test ? { key: test, mode: 'test_store' } : { key: '', mode: 'none' };
}

let configuredWith: string | null = null;

/** Connects RevenueCat to the signed-in user (their Supabase id). */
export async function connectStore(appUserId: string): Promise<boolean> {
  const { key } = storeSetup();
  if (!key) return false;
  if (configuredWith !== key) {
    if (__DEV__) Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN).catch(() => {});
    Purchases.configure({ apiKey: key, appUserID: appUserId });
    configuredWith = key;
    return true;
  }
  if ((await Purchases.getAppUserID()) !== appUserId) await Purchases.logIn(appUserId);
  return true;
}

/** Signs RevenueCat out (so the next user starts clean). */
export async function disconnectStore(): Promise<void> {
  if (!configuredWith) return;
  try {
    if (!(await Purchases.isAnonymous())) await Purchases.logOut();
  } catch {
    // Already anonymous.
  }
}

export const storeConnected = () => configuredWith !== null;

/** The plan the store sees on this phone (may be ahead of the server for a moment). */
export function tierFromCustomerInfo(info: CustomerInfo): Tier {
  const active = info.entitlements.active;
  return active.elite ? 'elite' : active.pro ? 'pro' : 'free';
}

export type PurchaseFailure = 'cancelled' | 'pending' | 'not_allowed' | 'network' | 'already_owned' | 'unavailable' | 'failed';

export function purchaseFailure(e: unknown): PurchaseFailure {
  const err = (e ?? {}) as Partial<PurchasesError>;
  const codes = Purchases.PURCHASES_ERROR_CODE;
  if (err.userCancelled || err.code === codes.PURCHASE_CANCELLED_ERROR) return 'cancelled';
  switch (err.code) {
    case codes.PAYMENT_PENDING_ERROR:
      return 'pending';
    case codes.PURCHASE_NOT_ALLOWED_ERROR:
    case codes.INSUFFICIENT_PERMISSIONS_ERROR:
      return 'not_allowed';
    case codes.NETWORK_ERROR:
    case codes.OFFLINE_CONNECTION_ERROR:
      return 'network';
    case codes.PRODUCT_ALREADY_PURCHASED_ERROR:
    case codes.RECEIPT_ALREADY_IN_USE_ERROR:
      return 'already_owned';
    case codes.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
    case codes.CONFIGURATION_ERROR:
    case codes.UNSUPPORTED_ERROR:
      return 'unavailable';
    default:
      return 'failed';
  }
}
