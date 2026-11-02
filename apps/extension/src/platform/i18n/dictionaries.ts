import type { AppLocale } from '@sniptale/platform/i18n/config';
import en from './catalogs/en.json';
import ru from './catalogs/ru.json';
import type { TranslationDictionary } from './types';

const dictionaries: Record<AppLocale, TranslationDictionary> = { en, ru };

/** Returns the bundled full catalogs without rebuilding their trees. */
export function getResolvedDictionaries(): Record<AppLocale, TranslationDictionary> {
  return dictionaries;
}
