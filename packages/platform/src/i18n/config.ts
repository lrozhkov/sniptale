/**
 * Canonical locale registry for translation lookup and Intl formatting.
 */
const LOCALE_REGISTRY = {
  ru: {
    intlLocale: 'ru-RU',
  },
  en: {
    intlLocale: 'en-US',
  },
} as const;

export type AppLocale = keyof typeof LOCALE_REGISTRY;

export const DEFAULT_LOCALE: AppLocale = 'ru';
export const SUPPORTED_LOCALES = Object.freeze(Object.keys(LOCALE_REGISTRY) as AppLocale[]);

/**
 * Resolves the Intl locale tag used by number, date, and collation helpers.
 */
export function getIntlLocale(locale: AppLocale): string {
  return LOCALE_REGISTRY[locale].intlLocale;
}

export { DEFAULT_LOCALE as FALLBACK_LOCALE };
