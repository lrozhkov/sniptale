import { DEFAULT_LOCALE, type AppLocale } from '@sniptale/platform/i18n/config';
import { getCurrentLocale } from './locale/state';
import { readTranslation, resolveTranslationDictionary } from './translation-reader';
import type { Translate, TranslationDictionary, TranslationKey } from './types';

export function getDictionary(locale: AppLocale): TranslationDictionary {
  return resolveTranslationDictionary(locale);
}

export function createTranslator(locale: AppLocale = DEFAULT_LOCALE): Translate {
  const dictionary = getDictionary(locale);
  return (key) => readTranslation(dictionary, key);
}

export function translate(key: TranslationKey, locale?: AppLocale): string {
  return createTranslator(locale ?? getCurrentLocale())(key);
}

export { compareStrings, formatDateTime, formatNumber } from '@sniptale/platform/i18n/format';
export { usePageLocaleMetadata } from './page-metadata';
export {
  getStoredLocalePreference,
  setLocalePreference,
  subscribeToLocaleChanges,
} from './locale/state';
export { getCurrentLocale } from './locale/state';
export { useAppLocale } from './locale/hook';
export { DEFAULT_LOCALE, FALLBACK_LOCALE, SUPPORTED_LOCALES } from '@sniptale/platform/i18n/config';
export type { AppLocale, Translate, TranslationDictionary, TranslationKey } from './types';
