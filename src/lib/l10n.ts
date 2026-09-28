import { useLanguage } from '@/i18n/LanguageProvider';

/**
 * Content that comes with the app (hustles, roadmaps, sample chats) is
 * stored in both languages side by side. Later this will come from the
 * database in the same shape.
 */
export interface L10n {
  en: string;
  pl: string;
}

export function useL() {
  const { language } = useLanguage();
  return (text: L10n) => text[language] ?? text.en;
}
