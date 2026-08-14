import type { AppLocale } from '@sniptale/platform/i18n/config';
import { translationMessages } from './messages';
import { resolveMessageSource } from './messages/source';
import type { TranslationDictionary } from './types';

function createDictionaries(): Record<AppLocale, TranslationDictionary> {
  return {
    en: resolveMessageSource(translationMessages, 'en'),
    ru: resolveMessageSource(translationMessages, 'ru'),
  };
}

let dictionaries: Record<AppLocale, TranslationDictionary> | null = null;

/**
 * Full dictionaries are retained for callers that need an inspectable object, but building
 * both locale trees is intentionally deferred. Most runtime lookups read the authored source
 * directly and should not pay this cost while an extension page is starting.
 */
export function getResolvedDictionaries(): Record<AppLocale, TranslationDictionary> {
  dictionaries ??= createDictionaries();
  return dictionaries;
}
