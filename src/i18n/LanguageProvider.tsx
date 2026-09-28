import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { loadJSON, saveJSON, StorageKeys } from '@/lib/storage';

import i18n, { deviceLanguage, type Language, type LanguagePreference } from './index';

interface LanguageContextValue {
  language: Language;
  preference: LanguagePreference;
  setPreference: (pref: LanguagePreference) => void;
  ready: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LanguagePreference>('system');
  const [device, setDevice] = useState<Language>(deviceLanguage);
  const [ready, setReady] = useState(false);
  const language: Language = preference === 'system' ? device : preference;

  useEffect(() => {
    loadJSON<LanguagePreference>(StorageKeys.language).then((saved) => {
      if (saved === 'system' || saved === 'en' || saved === 'pl') setPreferenceState(saved);
      setReady(true);
    });
  }, []);

  // Keep i18next in sync with the chosen language.
  useEffect(() => {
    if (i18n.language !== language) i18n.changeLanguage(language);
  }, [language]);

  // Android lets people change the phone language while the app is open.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setDevice(deviceLanguage());
    });
    return () => sub.remove();
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      preference,
      setPreference: (pref) => {
        setPreferenceState(pref);
        saveJSON(StorageKeys.language, pref);
      },
      ready,
    }),
    [language, preference, ready],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}
