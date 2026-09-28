// Supabase Edge Function: promo-push
//
// Admins only (profiles.is_admin): sends a promotional notification, e.g.
// "Yearly plans are 30% off this week". It only ever reaches people who
// switched on "Offers & news" in Profile (profiles.promo_push_opt_in) and
// allowed notifications. The daily coach message doesn't depend on it.
//
// Request body:
//   { "audience": "all" | "free" | "pro" | "elite",
//     "title_en": "...", "body_en": "...", "title_pl": "...", "body_pl": "...",
//     "url": "/today" | "/paywall" | "/coach" | "/machine",
//     "dry_run": true }            ← only counts the recipients
// Sending runs in the background; follow it in the promo_campaigns table.
// Optional secret: EXPO_ACCESS_TOKEN (only with Expo "enhanced push security").

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const AUDIENCES = ['all', 'free', 'pro', 'elite'] as const;
const URLS = ['/today', '/paywall', '/coach', '/machine'] as const;
const PAGE = 1000;
const TOKEN = /^Expo(nent)?PushToken\[.+\]$/;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

interface Target {
  user_id: string;
  expo_push_token: string;
  locale: string;
}

interface Campaign {
  id: string;
  audience: string;
  title_en: string;
  body_en: string;
  title_pl: string;
  body_pl: string;
  url: string;
}

async function allTargets(admin: SupabaseClient, audience: string): Promise<Target[]> {
  const out: Target[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.rpc('promo_push_targets', { p_audience: audience, p_limit: PAGE, p_offset: offset });
    if (error) throw new Error(`promo_push_targets: ${error.message}`);
    const rows = ((data ?? []) as Target[]).filter((t) => TOKEN.test(t.expo_push_token));
    out.push(...rows);
    if ((data ?? []).length < PAGE) break;
  }
  return out;
}

async function send(admin: SupabaseClient, campaign: Campaign, targets: Target[]): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (expoToken) headers.Authorization = `Bearer ${expoToken}`;

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i += 100) {
    const chunk = targets.slice(i, i + 100);
    const payload = chunk.map((t) => ({
      to: t.expo_push_token,
      title: t.locale === 'pl' ? campaign.title_pl : campaign.title_en,
      body: t.locale === 'pl' ? campaign.body_pl : campaign.body_en,
      sound: 'default',
      data: { url: campaign.url, kind: 'promo', campaign: campaign.id },
    }));
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers, body: JSON.stringify(payload) });
      if (!res.ok) {
        failed += chunk.length;
        console.error('promo-push: Expo', res.status, (await res.text()).slice(0, 300));
        continue;
      }
      const tickets = ((await res.json()).data ?? []) as { status: string; details?: { error?: string } }[];
      const gone: string[] = [];
      chunk.forEach((t, k) => {
        if (tickets[k]?.status === 'ok') sent += 1;
        else {
          failed += 1;
          if (tickets[k]?.details?.error === 'DeviceNotRegistered') gone.push(t.user_id);
        }
      });
      if (gone.length) await admin.from('profiles').update({ expo_push_token: null }).in('id', gone);
    } catch (e) {
      failed += chunk.length;
      console.error('promo-push: request failed', e);
    }
    await admin.from('promo_campaigns').update({ sent, failed }).eq('id', campaign.id);
  }
  await admin
    .from('promo_campaigns')
    .update({ status: failed && !sent ? 'failed' : 'sent', sent, failed, finished_at: new Date().toISOString() })
    .eq('id', campaign.id);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: null };
  const userId = auth?.user?.id;
  if (!userId) return json({ error: 'not_authenticated' }, 401);
  const { data: me } = await admin.from('profiles').select('is_admin').eq('id', userId).maybeSingle();
  if (!me?.is_admin) return json({ error: 'admin_only' }, 403);

  const body = await req.json().catch(() => ({}));
  const audience = AUDIENCES.find((a) => a === body.audience) ?? 'all';
  const url = URLS.find((u) => u === body.url) ?? '/today';
  const titleEn = text(body.title_en, 80);
  const bodyEn = text(body.body_en, 300);
  const titlePl = text(body.title_pl, 80) || titleEn;
  const bodyPl = text(body.body_pl, 300) || bodyEn;
  if (!titleEn || !bodyEn) return json({ error: 'missing_text' }, 400);

  try {
    const targets = await allTargets(admin, audience);
    if (body.dry_run === true) return json({ ok: true, dry_run: true, recipients: targets.length });
    if (targets.length === 0) return json({ ok: true, recipients: 0 });

    const { data: campaign, error } = await admin
      .from('promo_campaigns')
      .insert({ created_by: userId, audience, title_en: titleEn, body_en: bodyEn, title_pl: titlePl, body_pl: bodyPl, url, recipients: targets.length })
      .select('id, audience, title_en, body_en, title_pl, body_pl, url')
      .single();
    if (error || !campaign) throw new Error(`promo_campaigns: ${error?.message}`);

    // Keep sending after the response (large lists take a while).
    const task = send(admin, campaign as Campaign, targets).catch(async (e) => {
      console.error('promo-push failed', e);
      await admin.from('promo_campaigns').update({ status: 'failed', error: String(e).slice(0, 300), finished_at: new Date().toISOString() }).eq('id', campaign.id);
    });
    const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(task);
    else await task;

    return json({ ok: true, campaign_id: campaign.id, recipients: targets.length });
  } catch (e) {
    console.error('promo-push', e);
    return json({ error: 'server_error' }, 500);
  }
});
