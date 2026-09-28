import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { loadJSON, saveJSON, StorageKeys } from '@/lib/storage';

import { palette, type Colors, type Scheme } from './tokens';

export type ThemePreference = 'system' | Scheme;

interface ThemeContextValue {
  colors: Colors;
  scheme: Scheme;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadJSON<ThemePreference>(StorageKeys.theme).then((saved) => {
      if (saved === 'dark' || saved === 'light' || saved === 'system') setPreferenceState(saved);
      setReady(true);
    });
  }, []);

  // The brand is dark-first, so an unknown system scheme falls back to dark.
  const scheme: Scheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
  const colors = palette[scheme];

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [colors.bg]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors,
      scheme,
      isDark: scheme === 'dark',
      preference,
      setPreference: (pref) => {
        setPreferenceState(pref);
        saveJSON(StorageKeys.theme, pref);
      },
      ready,
    }),
    [colors, scheme, preference, ready],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Renders its children in a fixed color scheme (e.g. share cards are always dark). */
export function ThemeScope({ scheme, children }: { scheme: Scheme; children: ReactNode }) {
  const parent = useTheme();
  const value = useMemo<ThemeContextValue>(
    () => ({ ...parent, colors: palette[scheme], scheme, isDark: scheme === 'dark' }),
    [parent, scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

/**
 * Build a StyleSheet from the current colors. Usage:
 *   const s = useStyles(makeStyles);
 *   const makeStyles = (c: Colors) => StyleSheet.create({...});
 */
export function useStyles<T>(factory: (c: Colors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
