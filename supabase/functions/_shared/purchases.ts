// Shared code for the purchase Edge Functions (revenuecat-webhook,
// sync-purchases). `npm run sync:functions` copies this file into both
// functions between the PURCHASES SHARED markers, so each function stays a
// single file you can paste into the Supabase dashboard. Edit it here,
// never inside a function.
//
// The rule: the server never trusts the app about purchases. It asks
// RevenueCat (with the secret key REVENUECAT_SECRET_KEY) what the user
// really owns, and saves that: the plan (profiles.tier), one-time
// purchases (credits) and referral rewards.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

// ---------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function errorResponse(e: unknown, where: string): Response {
  if (e instanceof HttpError) return json({ error: e.code, ...e.extra }, e.status);
  console.error(where, e);
  return json({ error: 'server_error' }, 500);
}

type Db = SupabaseClient;

function adminClient(): Db {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The signed-in user who called the function (from their access token). */
async function requireUser(req: Request, admin: Db): Promise<{ id: string }> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'not_authenticated');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'not_authenticated');
  return { id: data.user.id };
}

const isString = (v: unknown): v is string => typeof v === 'string';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function rpc<T = unknown>(admin: Db, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

// ---------------------------------------------------------------------
// Products (the same ids as in App Store Connect and RevenueCat)
// ---------------------------------------------------------------------

/** RevenueCat entitlement ids. Elite products are attached to both. */
const ENTITLEMENT_PRO = 'pro';
const ENTITLEMENT_ELITE = 'elite';

/**
 * One-time purchases. A product matches its id or the id plus "_something"
 * (e.g. chosen_fast_pivot_b for a price test).
 */
const CONSUMABLES = [
  { prefix: 'chosen_fast_pivot', kind: 'fast_pivot', amount: 1 },
  { prefix: 'chosen_messages_100', kind: 'messages', amount: 100 },
] as const;
type ConsumableKind = (typeof CONSUMABLES)[number]['kind'];

function consumableFor(productId: unknown) {
  if (!isString(productId)) return null;
  return CONSUMABLES.find((c) => productId === c.prefix || productId.startsWith(`${c.prefix}_`)) ?? null;
}

/** Referral rewards. */
const FRIEND_BONUS_MESSAGES = 50;
const REFERRER_BONUS_MESSAGES = 100;

// ---------------------------------------------------------------------
// RevenueCat REST API (v1, secret key)
// ---------------------------------------------------------------------

const RC_API = 'https://api.revenuecat.com/v1';

function rcKey(): string {
  const key = Deno.env.get('REVENUECAT_SECRET_KEY');
  if (!key) throw new HttpError(503, 'purchases_not_configured');
  return key;
}

// deno-lint-ignore no-explicit-any
async function rcRequest(path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
  const key = rcKey();
  let last = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(`${RC_API}${path}`, {
        method: init.method ?? 'GET',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      last = errorText(e);
    }
    if (res?.ok) return await res.json();
    if (res) {
      last = `RevenueCat ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`;
      // 4xx (except 429) won't get better by retrying.
      if (res.status < 500 && res.status !== 429) break;
    }
    if (attempt < 2) await sleep(700 * (attempt + 1));
  }
  throw new Error(last || 'RevenueCat unavailable');
}

interface RcEntitlement {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  product_identifier: string;
  purchase_date?: string;
}
interface RcSubscription {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  period_type?: string; // normal / trial / intro
  store?: string; // app_store / play_store / promotional / …
  is_sandbox?: boolean;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  refunded_at?: string | null;
}
interface RcTransaction {
  id: string;
  store_transaction_id?: string | null;
  store?: string;
  is_sandbox?: boolean;
  purchase_date?: string;
}
interface RcSubscriber {
  entitlements?: Record<string, RcEntitlement>;
  subscriptions?: Record<string, RcSubscription>;
  non_subscriptions?: Record<string, RcTransaction[]>;
}

/** What RevenueCat knows about a user right now. */
async function fetchSubscriber(appUserId: string): Promise<{ subscriber: RcSubscriber; fetchedAt: string }> {
  const fetchedAt = new Date().toISOString();
  const data = await rcRequest(`/subscribers/${encodeURIComponent(appUserId)}`);
  return { subscriber: (data?.subscriber ?? {}) as RcSubscriber, fetchedAt };
}

const ms = (s?: string | null) => (s ? Date.parse(s) : NaN);

/** Active, or still in the billing grace period. No end date = lifetime. */
function isActive(e: { expires_date: string | null; grace_period_expires_date?: string | null } | undefined, now: number): boolean {
  if (!e) return false;
  if (e.expires_date == null) return true;
  return ms(e.expires_date) > now || ms(e.grace_period_expires_date) > now;
}

/** Access granted for free (referral reward, or granted in the dashboard). */
const isPromo = (productId: string, sub?: RcSubscription) => productId.startsWith('rc_promo') || sub?.store === 'promotional';

interface PlanState {
  tier: 'free' | 'pro' | 'elite';
  product: string | null;
  store: string | null;
  expires_at: string | null;
  will_renew: boolean | null;
  is_trial: boolean;
  is_promo: boolean;
}

/** The plan the user has paid for (or was given). Elite wins over Pro. */
function planState(subscriber: RcSubscriber, now = Date.now()): PlanState {
  const ents = subscriber.entitlements ?? {};
  const tier = isActive(ents[ENTITLEMENT_ELITE], now) ? 'elite' : isActive(ents[ENTITLEMENT_PRO], now) ? 'pro' : 'free';
  if (tier === 'free') {
    return { tier, product: null, store: null, expires_at: null, will_renew: null, is_trial: false, is_promo: false };
  }
  const ent = ents[tier];
  const sub = subscriber.subscriptions?.[ent.product_identifier];
  const promo = isPromo(ent.product_identifier, sub);
  return {
    tier,
    product: ent.product_identifier,
    store: sub?.store ?? (promo ? 'promotional' : null),
    expires_at: ent.expires_date ?? null,
    will_renew: promo ? false : sub ? !sub.unsubscribe_detected_at && !sub.billing_issues_detected_at : null,
    is_trial: sub?.period_type === 'trial',
    is_promo: promo,
  };
}

/** A paid (not free-trial, not gifted, not refunded) subscription, if any. */
function paidSubscriptionProduct(subscriber: RcSubscriber, allowSandbox: boolean): string | null {
  for (const [productId, sub] of Object.entries(subscriber.subscriptions ?? {})) {
    if (isPromo(productId, sub) || sub.refunded_at || sub.period_type === 'trial') continue;
    if (sub.is_sandbox && !allowSandbox) continue;
    return productId;
  }
  return null;
}

/** Currently paying for a subscription (a trial counts: they subscribed). */
function hasActivePaidSubscription(subscriber: RcSubscriber, now: number): boolean {
  return Object.entries(subscriber.subscriptions ?? {}).some(
    ([productId, sub]) => !isPromo(productId, sub) && !sub.refunded_at && isActive(sub, now),
  );
}

/** When a gifted Pro month ends (0 if there is none). */
function promoProEnd(subscriber: RcSubscriber, now: number): number {
  const e = subscriber.entitlements?.[ENTITLEMENT_PRO];
  if (!e || !isActive(e, now) || !isPromo(e.product_identifier, subscriber.subscriptions?.[e.product_identifier])) return 0;
  return e.expires_date ? ms(e.expires_date) : 0;
}

function addOneMonth(time: number): number {
  const d = new Date(time);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.getTime();
}

interface ConsumableTx {
  grantId: string;
  productId: string;
  kind: ConsumableKind;
  amount: number;
  store: string | null;
  sandbox: boolean;
  purchasedAt: string | null;
}

/** One-time purchases in the user's history (the store transaction id is the key). */
function consumableTransactions(subscriber: RcSubscriber): ConsumableTx[] {
  const out: ConsumableTx[] = [];
  for (const [productId, list] of Object.entries(subscriber.non_subscriptions ?? {})) {
    const c = consumableFor(productId);
    if (!c || !Array.isArray(list)) continue;
    for (const tx of list) {
      if (tx.store === 'promotional') continue;
      const grantId = tx.store_transaction_id || (tx.id ? `rc:${tx.id}` : '');
      if (!grantId) continue;
      out.push({
        grantId,
        productId,
        kind: c.kind,
        amount: c.amount,
        store: tx.store ?? null,
        sandbox: !!tx.is_sandbox,
        purchasedAt: tx.purchase_date ?? null,
      });
    }
  }
  return out;
}

const allowSandboxReferrals = () => Deno.env.get('REFERRAL_REWARDS_IN_SANDBOX') === 'true';

// ---------------------------------------------------------------------
// Reconcile: make the database match RevenueCat for one user
// ---------------------------------------------------------------------

interface ReconcileResult {
  known: boolean;
  tier: PlanState['tier'];
  oldTier: string | null;
  granted: Record<ConsumableKind, number>;
  referral: 'none' | 'rewarded' | 'waiting';
}

async function reconcileUser(admin: Db, uid: string): Promise<ReconcileResult> {
  const { subscriber, fetchedAt } = await fetchSubscriber(uid);
  const state = planState(subscriber);
  const granted: Record<ConsumableKind, number> = { fast_pivot: 0, messages: 0 };

  const applied = await rpc<{ tier: string; old_tier: string } | null>(admin, 'apply_purchase_state', {
    p_uid: uid,
    p_state: state,
    p_fetched_at: fetchedAt,
  });
  if (!applied) return { known: false, tier: 'free', oldTier: null, granted, referral: 'none' };

  // One-time purchases: each store transaction is granted once, ever.
  for (const tx of consumableTransactions(subscriber)) {
    const ok = await rpc<boolean>(admin, 'grant_consumable', {
      p_uid: uid,
      p_grant_id: tx.grantId,
      p_product: tx.productId,
      p_kind: tx.kind,
      p_amount: tx.amount,
      p_store: tx.store,
      p_is_sandbox: tx.sandbox,
      p_purchased_at: tx.purchasedAt,
    });
    if (ok) granted[tx.kind] += tx.amount;
  }

  // Referral: this user started paying → reward the friend who invited them.
  let referral: ReconcileResult['referral'] = 'none';
  const paid = paidSubscriptionProduct(subscriber, allowSandboxReferrals());
  if (paid) {
    const pending = await rpc<{ id: string; referrer_id: string } | null>(admin, 'referral_qualify', {
      p_referred: uid,
      p_product: paid,
      p_friend_bonus: FRIEND_BONUS_MESSAGES,
    });
    if (pending?.id) referral = (await rewardReferrer(admin, pending)) ? 'rewarded' : 'waiting';
  }

  return { known: true, tier: state.tier, oldTier: applied.old_tier, granted, referral };
}

/**
 * The referrer's reward: 1 month of Pro (a RevenueCat promotional
 * entitlement, added after any gifted month they already have), or 100
 * bonus messages if they already pay for a subscription.
 * Returns false when another server call is handing it out right now.
 */
async function rewardReferrer(admin: Db, referral: { id: string; referrer_id: string }): Promise<boolean> {
  const claimed = await rpc<boolean>(admin, 'referral_claim', { p_referral_id: referral.id });
  if (!claimed) return false;

  let granted = false;
  try {
    const now = Date.now();
    const { subscriber } = await fetchSubscriber(referral.referrer_id);
    if (hasActivePaidSubscription(subscriber, now)) {
      await rpc(admin, 'referral_rewarded', { p_referral_id: referral.id, p_reward: 'messages', p_messages: REFERRER_BONUS_MESSAGES });
      return true;
    }

    const endTime = addOneMonth(Math.max(now, promoProEnd(subscriber, now)));
    const fetchedAt = new Date().toISOString();
    const result = await rcRequest(`/subscribers/${encodeURIComponent(referral.referrer_id)}/entitlements/${ENTITLEMENT_PRO}/promotional`, {
      method: 'POST',
      body: { end_time_ms: endTime },
    });
    granted = true;
    await rpc(admin, 'referral_rewarded', { p_referral_id: referral.id, p_reward: 'pro_month' });
    if (result?.subscriber) {
      await rpc(admin, 'apply_purchase_state', {
        p_uid: referral.referrer_id,
        p_state: planState(result.subscriber as RcSubscriber),
        p_fetched_at: fetchedAt,
      });
    }
    return true;
  } catch (e) {
    // If the month was already given, keep the claim so it isn't given twice.
    if (!granted) await admin.rpc('referral_release', { p_referral_id: referral.id, p_error: errorText(e) });
    throw e;
  }
}
