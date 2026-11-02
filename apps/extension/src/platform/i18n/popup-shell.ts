import { catalogs } from 'sniptale:i18n/popup-shell';
import { readCatalogTranslation } from './catalog-reader';
import type { AppLocale, LeafTranslationKey } from './types';
import type { CatalogSubset } from './catalog-subsets';

/** Reads the bundled messages for this compact runtime entry. */
export function readPopupShellTranslation(
  locale: AppLocale,
  key: LeafTranslationKey<CatalogSubset<'popup-shell'>>
): string {
  return readCatalogTranslation(catalogs, locale, key);
}
