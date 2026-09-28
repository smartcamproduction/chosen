import 'i18next';

import type en from './locales/en.json';

// Gives autocomplete and type-checking for every t('…') key.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof en;
    };
  }
}
