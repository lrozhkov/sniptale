import en from '../../../../apps/extension/src/platform/i18n/catalogs/en.json' with { type: 'json' };
import ru from '../../../../apps/extension/src/platform/i18n/catalogs/ru.json' with { type: 'json' };
import { readCatalogTranslation } from '../../../../apps/extension/src/platform/i18n/catalog-reader';
import type { Translate, TranslationKey } from '../../../../apps/extension/src/platform/i18n/types';
import { DEFAULT_LOCALE, type AppLocale } from '@sniptale/platform/i18n/config';

const catalogs: Readonly<Record<AppLocale, unknown>> = { en, ru };

/** Read authored copy for Node-side assertions without starting a browser runtime. */
export function translate(key: TranslationKey, locale: AppLocale = DEFAULT_LOCALE): string {
  return readCatalogTranslation(catalogs, locale, key);
}

/** Bind the assertion language without importing production catalog preparation. */
export function createTranslator(locale: AppLocale = DEFAULT_LOCALE): Translate {
  return (key) => translate(key, locale);
}
