/** Registered locale identities, native names, and Intl language tags. */
export const LOCALE_REGISTRY = {
  ru: { intlLocale: 'ru-RU', nativeName: 'Русский' },
  en: { intlLocale: 'en-US', nativeName: 'English' },
} as const;

export type AppLocale = keyof typeof LOCALE_REGISTRY;

export const DEFAULT_LOCALE: AppLocale = 'en';
export const FALLBACK_LOCALE: AppLocale = DEFAULT_LOCALE;
export const SUPPORTED_LOCALES = Object.freeze(Object.keys(LOCALE_REGISTRY) as AppLocale[]);

/** Accept only a registered identity without coercion or locale-tag normalization. */
export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && Object.hasOwn(LOCALE_REGISTRY, value);
}
