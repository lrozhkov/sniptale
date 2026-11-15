import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type AppLocale } from '@sniptale/platform/i18n/config';
import { readPreparedTranslation } from './locale/state';
import { useAppLocale } from './locale/hook';
import { getCurrentLocale, setLocalePreference } from './locale/state';
import type { Translate, TranslationKey } from './types';

export function createTranslator(locale: AppLocale = DEFAULT_LOCALE): Translate {
  return (key) => readPreparedTranslation(locale, key);
}

export function translate(key: TranslationKey, locale?: AppLocale): string {
  return createTranslator(locale ?? getCurrentLocale())(key);
}

export { getCurrentLocale, setLocalePreference, useAppLocale, SUPPORTED_LOCALES };
export type { AppLocale, TranslationKey };
