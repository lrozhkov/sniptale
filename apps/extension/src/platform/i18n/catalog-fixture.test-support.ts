import en from './catalogs/en.json';
import ru from './catalogs/ru.json';
import { readCatalogTranslation } from './catalog-reader';
import type { AppLocale, Translate, TranslationDictionary, TranslationKey } from './types';

const catalogs: Record<AppLocale, TranslationDictionary> = { en, ru };

/** Read authored copy directly when the test does not exercise runtime preparation. */
export function getCatalogFixture(locale: AppLocale): TranslationDictionary {
  return catalogs[locale];
}

/** Translate authored copy without changing the production translator or its readiness state. */
export function translateCatalogFixture(key: TranslationKey, locale: AppLocale): string {
  return readCatalogTranslation(catalogs, locale, key);
}

/** Supply a test-owned translator to APIs that explicitly accept one. */
export function createCatalogFixtureTranslator(locale: AppLocale): Translate {
  return (key) => translateCatalogFixture(key, locale);
}

/** Supply flat packaged data to a test-owned catalog transport. */
export function catalogFixtureMessages(
  locale: AppLocale,
  catalog: unknown = getCatalogFixture(locale)
): Record<string, string> {
  const result: Record<string, string> = {};
  function visit(value: unknown, prefix: string) {
    if (typeof value === 'string') {
      result[prefix] = value;
      return;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid test catalog fixture');
    }
    for (const [key, child] of Object.entries(value)) {
      visit(child, prefix ? `${prefix}.${key}` : key);
    }
  }
  visit(catalog, '');
  return result;
}
