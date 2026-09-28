// Supabase Edge Function: refresh-exchange-rates
//
// Updates public.exchange_rates (units of each currency per 1 USD) from the
// European Central Bank's daily reference rates, via the free Frankfurter
// API (no API key). Ranks are based on profit in USD, so these rates are
// used to convert every check-in.
//
// Run it once a day with Supabase Cron (see docs/SETUP-BACKEND.md). It skips
// the update if the rates are less than 6 hours old, so calling it more
// often does no harm.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CURRENCIES = ['EUR', 'GBP', 'PLN'];
const SOURCE = `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${CURRENCIES.join(',')}`;
const MIN_AGE_MS = 6 * 60 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Accepts both the v1 shape ({ rates: { EUR: 0.87 } }) and a list of { quote, rate }. */
function readRates(body: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (Array.isArray(body)) {
    for (const row of body) {
      if (row && typeof row.quote === 'string' && typeof row.rate === 'number') out[row.quote.toUpperCase()] = row.rate;
    }
  } else if (body && typeof body === 'object' && 'rates' in body) {
    const rates = (body as { rates: Record<string, unknown> }).rates;
    for (const [code, rate] of Object.entries(rates ?? {})) if (typeof rate === 'number') out[code.toUpperCase()] = rate;
  }
  return out;
}

Deno.serve(async () => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: oldest } = await admin
      .from('exchange_rates')
      .select('updated_at')
      .in('currency', CURRENCIES)
      .order('updated_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (oldest && Date.now() - new Date(oldest.updated_at).getTime() < MIN_AGE_MS) {
      return json({ ok: true, skipped: 'rates are recent' });
    }

    const res = await fetch(SOURCE, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`rates source answered ${res.status}`);
    const rates = readRates(await res.json());

    const now = new Date().toISOString();
    const rows = CURRENCIES.filter((c) => Number.isFinite(rates[c]) && rates[c] > 0).map((currency) => ({
      currency,
      usd_rate: rates[currency],
      updated_at: now,
    }));
    if (rows.length === 0) throw new Error('no usable rates in the response');

    const { error } = await admin.from('exchange_rates').upsert([{ currency: 'USD', usd_rate: 1, updated_at: now }, ...rows]);
    if (error) throw error;

    return json({ ok: true, rates: Object.fromEntries(rows.map((r) => [r.currency, r.usd_rate])) });
  } catch (e) {
    console.error('refresh-exchange-rates failed', e);
    return json({ ok: false, error: String(e) }, 500);
  }
});
