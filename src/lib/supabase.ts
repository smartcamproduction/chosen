import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import type { Database } from './database.types';

/**
 * Supabase client. The app only ever uses the project URL and the public
 * (anon / publishable) key. Both are safe to ship; Row Level Security
 * protects the data. Secret keys live only in Edge Functions.
 *
 * Values come from the `.env` file (see `.env.example`).
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured =
  url.startsWith('https://') && !url.includes('YOUR-') && anonKey.length > 20 && !anonKey.startsWith('YOUR-');

export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured
  ? createClient<Database>(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // On web the OAuth redirect lands back on the page with ?code=…
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
        lock: processLock,
      },
    })
  : null;

// Keep the session fresh only while the app is in the foreground.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
