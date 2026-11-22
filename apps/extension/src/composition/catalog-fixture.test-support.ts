import { catalogFixtureMessages } from '../platform/i18n/catalog-fixture.test-support';
import { prepareTranslations, setLocalePreference } from '../platform/i18n/locale/state';
import type { CatalogProfile } from '../platform/i18n/catalog-profiles';
import type { AppLocale } from '@sniptale/platform/i18n/config';

/** Supply authored data through the transport seam for direct composition tests. */
export function loadCompositionCatalogFixture(locale: AppLocale): Promise<Record<string, string>> {
  return Promise.resolve(catalogFixtureMessages(locale));
}

/** Prepare the owning surface and select the locale before a direct component render. */
export async function prepareCompositionTranslations(
  profile: CatalogProfile,
  locale: AppLocale
): Promise<void> {
  await prepareTranslations(profile, locale);
  await setLocalePreference(locale);
}
