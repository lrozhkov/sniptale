import { readPreparedTranslation } from './locale/state';
import type { AppLocale, LeafTranslationKey } from './types';
import type { CatalogSubset } from './catalog-subsets';

/** Reads the bundled messages for this compact runtime entry. */
export function readPopupShellTranslation(
  locale: AppLocale,
  key: LeafTranslationKey<CatalogSubset<'popup-shell'>>
): string {
  return readPreparedTranslation(locale, key);
}
