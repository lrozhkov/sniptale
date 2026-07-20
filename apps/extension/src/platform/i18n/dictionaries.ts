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

export const dictionaries = createDictionaries();
