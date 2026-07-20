/**
 * Canonical locale registry for translation lookup and Intl formatting.
 */
const LOCALE_REGISTRY = {
  ru: {
    intlLocale: 'ru-RU',
    labels: {
      ru: 'Русский',
      en: 'Russian',
    },
  },
  en: {
    intlLocale: 'en-US',
    labels: {
      ru: 'English',
      en: 'English',
    },
  },
} as const;

export type AppLocale = keyof typeof LOCALE_REGISTRY;

export const DEFAULT_LOCALE: AppLocale = 'ru';
export const SUPPORTED_LOCALES = Object.freeze(Object.keys(LOCALE_REGISTRY) as AppLocale[]);

export const localeLanguageMessages = Object.freeze({
  en: {
    en: LOCALE_REGISTRY.en.labels.en,
    ru: LOCALE_REGISTRY.en.labels.ru,
  },
  ru: {
    en: LOCALE_REGISTRY.ru.labels.en,
    ru: LOCALE_REGISTRY.ru.labels.ru,
  },
} satisfies Record<AppLocale, Record<AppLocale, string>>);

/**
 * Resolves the Intl locale tag used by number, date, and collation helpers.
 */
export function getIntlLocale(locale: AppLocale): string {
  return LOCALE_REGISTRY[locale].intlLocale;
}

export { DEFAULT_LOCALE as FALLBACK_LOCALE };
