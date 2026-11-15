import { vi } from 'vitest';
import { catalogFixtureMessages } from '../platform/i18n/catalog-fixture.test-support';
import * as localeState from '../platform/i18n/locale/state';
import type { CatalogProfile } from '../platform/i18n/catalog-profiles';
import type { AppLocale } from '@sniptale/platform/i18n/config';

/** Supply authored data without making pure feature tests depend on browser storage. */
export function loadFeatureCatalogFixture(locale: AppLocale): Promise<Record<string, string>> {
  return Promise.resolve(catalogFixtureMessages(locale));
}

/** Prepare selected data and bind the explicit locale for direct feature tests. */
export async function prepareFeatureTranslations(
  profile: CatalogProfile,
  locale: AppLocale
): Promise<void> {
  await localeState.prepareTranslations(profile, locale);
  vi.spyOn(localeState, 'getCurrentLocale').mockReturnValue(locale);
}
