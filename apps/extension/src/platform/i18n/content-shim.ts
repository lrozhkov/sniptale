import { FALLBACK_LOCALE, type AppLocale } from '@sniptale/platform/i18n/config';
import { createCatalogStore } from './catalog-store';
import { loadCatalogMessages } from './catalog-transport';
import type { LeafTranslationKey } from './types';
import type { CatalogSubset } from './catalog-subsets';
import type { CatalogProfile } from './catalog-profiles';

export type ContentShimTranslate = (
  key: LeafTranslationKey<CatalogSubset<'content-shim'>>
) => string;

/** Own the launcher's small catalog without importing full locale state or storage. */
export function createContentShimTranslations(
  load: (locale: AppLocale, profile: CatalogProfile) => Promise<unknown> = loadCatalogMessages
) {
  const catalogs = createCatalogStore({ fallbackLocale: FALLBACK_LOCALE, load });
  return {
    prepare: (locale: AppLocale) => catalogs.prepare(locale, ['content-shim']),
    forLocale:
      (locale: AppLocale): ContentShimTranslate =>
      (key) =>
        catalogs.read(locale, key),
  };
}
