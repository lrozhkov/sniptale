import { FALLBACK_LOCALE, type AppLocale } from '@sniptale/platform/i18n/config';
import { dictionaries } from './dictionaries';
import type { TranslationDictionary, TranslationKey } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readTranslation(dictionary: TranslationDictionary, key: TranslationKey): string {
  const parts = key.split('.');
  let current: unknown = dictionary;

  for (const part of parts) {
    if (!isRecord(current) || !(part in current)) {
      return key;
    }
    current = current[part];
  }

  return typeof current === 'string' ? current : key;
}

export function resolveTranslationDictionary(locale: AppLocale): TranslationDictionary {
  return dictionaries[locale] ?? dictionaries[FALLBACK_LOCALE];
}
