// Supabase Edge Function: delete-account
//
// Permanently deletes the signed-in user:
//   1. every file they uploaded to the private "checkins" bucket (<user id>/…)
//   2. their auth account, which cascades to profiles and all their rows
//      (hustles, check-ins, coach messages, spins, badges, credits, referrals…)
//   3. their purchase history in RevenueCat (if REVENUECAT_SECRET_KEY is set).
//      An App Store subscription itself is managed by Apple: the app tells
//      users to cancel it in their Apple ID settings.
//
// Called from the app with the user's own access token. Uses the service role
// key, which only exists on the server and is never shipped in the app.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BUCKETS = ['checkins'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Recursively collects every file path under a folder. */
async function listAllFiles(admin: SupabaseClient, bucket: string, folder: string): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: pageSize, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const item of data) {
      const full = `${folder}/${item.name}`;
      // Folders have no id; files do.
      if (item.id === null) paths.push(...(await listAllFiles(admin, bucket, full)));
      else paths.push(full);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return paths;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'not_authenticated' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json({ error: 'not_authenticated' }, 401);

  try {
    for (const bucket of BUCKETS) {
      const files = await listAllFiles(admin, bucket, user.id);
      for (let i = 0; i < files.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(files.slice(i, i + 100));
        if (error) throw error;
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    // Best effort: the account is already gone, so a failure here is only logged.
    const revenueCatKey = Deno.env.get('REVENUECAT_SECRET_KEY');
    if (revenueCatKey) {
      const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${revenueCatKey}` },
      }).catch(() => null);
      if (!res?.ok && res?.status !== 404) console.error('RevenueCat delete failed', user.id, res?.status);
    }

    return json({ ok: true });
  } catch (e) {
    console.error('delete-account failed', user.id, e);
    return json({ error: 'delete_failed' }, 500);
  }
});
