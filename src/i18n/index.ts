import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import pl from './locales/pl.json';

export const LANGUAGES = ['en', 'pl'] as const;
export type Language = (typeof LANGUAGES)[number];
export type LanguagePreference = 'system' | Language;

/** The phone's language if we support it, otherwise English. */
export function deviceLanguage(): Language {
  try {
    const code = getLocales()[0]?.languageCode;
    return code === 'pl' ? 'pl' : 'en';
  } catch {
    return 'en';
  }
}

export function resolveLanguage(pref: LanguagePreference): Language {
  return pref === 'system' ? deviceLanguage() : pref;
}

const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    pl: { translation: pl },
  },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  supportedLngs: LANGUAGES,
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

export default i18n;
