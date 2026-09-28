import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Small wrapper around on-device storage for user preferences.
 * Failures are swallowed on purpose: a preference that can't be saved
 * should never crash the app.
 */
export async function loadJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw == null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export async function saveJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const StorageKeys = {
  theme: 'chosen.pref.theme',
  language: 'chosen.pref.language',
  app: 'chosen.mock.app',
} as const;
