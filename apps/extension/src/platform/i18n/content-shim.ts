import { catalogs } from 'sniptale:i18n/content-shim';
import { readCatalogTranslation } from './catalog-reader';
import type { AppLocale, LeafTranslationKey } from './types';
import type { CatalogSubset } from './catalog-subsets';

/** Reads the bundled messages for this compact runtime entry. */
export function readContentShimTranslation(
  locale: AppLocale,
  key: LeafTranslationKey<CatalogSubset<'content-shim'>>
): string {
  return readCatalogTranslation(catalogs, locale, key);
}
