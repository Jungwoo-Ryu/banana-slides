import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './locales/ko.json';

// Legacy zh locale requests use the English dictionary.
import en from './locales/en.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      zh: { translation: en },
      en: { translation: en },
    },
    lng: 'ko',
    fallbackLng: 'ko',
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'banana-slides-language',
    },
  });

export default i18n;
