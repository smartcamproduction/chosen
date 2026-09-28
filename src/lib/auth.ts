import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type AuthOutcome =
  | { ok: true; fullName: string | null }
  | { ok: false; cancelled?: boolean; error: string };

const fail = (error: string, cancelled = false): AuthOutcome => ({ ok: false, error, cancelled });

/** Native Apple sign-in sheet is available on iPhone / iPad. */
export async function canUseNativeApple(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Sign in with Apple.
 * iOS: native Apple sheet → ID token (with a one-time nonce) → Supabase.
 * Android / web: Supabase's browser flow.
 */
export async function signInWithApple(): Promise<AuthOutcome> {
  if (!supabase) return fail('not_configured');
  if (!(await canUseNativeApple())) return signInWithOAuth('apple');

  try {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) return fail('no_identity_token');

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) return fail(error.message);

    // Apple only shares the name on the very first sign-in.
    const fullName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ') || null;
    return { ok: true, fullName };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'ERR_REQUEST_CANCELED') return fail('cancelled', true);
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/** Continue with Google (secure browser sheet, works in Expo Go too). */
export function signInWithGoogle(): Promise<AuthOutcome> {
  return signInWithOAuth('google');
}

async function signInWithOAuth(provider: 'google' | 'apple'): Promise<AuthOutcome> {
  if (!supabase) return fail('not_configured');

  if (Platform.OS === 'web') {
    // The page redirects to the provider and comes back to /auth-callback.
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${origin}/auth-callback` } });
    return error ? fail(error.message) : { ok: true, fullName: null };
  }

  // chosen://auth-callback in real builds, exp://…/--/auth-callback in Expo Go.
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return fail(error?.message ?? 'no_auth_url');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return fail('cancelled', true);
  return createSessionFromUrl(result.url);
}

/** Finishes an OAuth redirect: exchanges the one-time code for a session. */
export async function createSessionFromUrl(url: string): Promise<AuthOutcome> {
  if (!supabase) return fail('not_configured');
  try {
    const parsed = new URL(url);
    const errorDescription = parsed.searchParams.get('error_description');
    if (errorDescription) return fail(errorDescription);

    const code = parsed.searchParams.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      return error ? fail(error.message) : { ok: true, fullName: null };
    }

    // Fallback for the implicit flow (tokens in the URL fragment).
    const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
    const accessToken = fragment.get('access_token');
    const refreshToken = fragment.get('refresh_token');
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      return error ? fail(error.message) : { ok: true, fullName: null };
    }
    return fail('no_code_in_redirect');
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/** Calls the delete-account Edge Function (deletes files + account + all data). */
export async function deleteAccountOnServer(): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'not_configured' };
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  return error ? { ok: false, error: error.message } : { ok: true };
}
