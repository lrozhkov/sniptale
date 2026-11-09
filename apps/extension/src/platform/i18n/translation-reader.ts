import { FALLBACK_LOCALE, type AppLocale } from '@sniptale/platform/i18n/config';
import { readCatalogTranslation } from './catalog-reader';
import { getResolvedDictionaries } from './dictionaries';
import type { TranslationDictionary, TranslationKey } from './types';

export function readSourceTranslation(locale: AppLocale, key: TranslationKey): string {
  return readCatalogTranslation(getResolvedDictionaries(), locale, key);
}

export function resolveTranslationDictionary(locale: AppLocale): TranslationDictionary {
  const dictionaries = getResolvedDictionaries();
  return dictionaries[locale] ?? dictionaries[FALLBACK_LOCALE];
}
