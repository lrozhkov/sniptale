import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type AppLocale } from '@sniptale/platform/i18n/config';
import { catalogs } from 'sniptale:i18n/popup';
import { readCatalogTranslation } from './catalog-reader';
import { useAppLocale } from './locale/hook';
import { getCurrentLocale, setLocalePreference } from './locale/state';
import type { Translate, TranslationKey } from './types';

export function createTranslator(locale: AppLocale = DEFAULT_LOCALE): Translate {
  return (key) => readCatalogTranslation(catalogs, locale, key);
}

export function translate(key: TranslationKey, locale?: AppLocale): string {
  return createTranslator(locale ?? getCurrentLocale())(key);
}

export { getCurrentLocale, setLocalePreference, useAppLocale, SUPPORTED_LOCALES };
export type { AppLocale, TranslationKey };
