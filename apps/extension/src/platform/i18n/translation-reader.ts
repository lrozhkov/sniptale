import { FALLBACK_LOCALE, type AppLocale } from '@sniptale/platform/i18n/config';
import { getResolvedDictionaries } from './dictionaries';
import { translationMessages } from './messages';
import type { TranslationDictionary, TranslationKey } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readSourceTranslation(locale: AppLocale, key: TranslationKey): string {
  const parts = key.split('.');
  let current: unknown = translationMessages;

  for (const part of parts) {
    if (!isRecord(current) || !(part in current)) {
      return key;
    }
    current = current[part];
  }

  if (!isRecord(current)) return key;
  const localizedValue = current[locale] ?? current[FALLBACK_LOCALE];
  return typeof localizedValue === 'string' ? localizedValue : key;
}

export function resolveTranslationDictionary(locale: AppLocale): TranslationDictionary {
  const dictionaries = getResolvedDictionaries();
  return dictionaries[locale] ?? dictionaries[FALLBACK_LOCALE];
}
