import { catalogFixtureMessages } from '../platform/i18n/catalog-fixture.test-support';
import { prepareTranslations, setLocalePreference } from '../platform/i18n/locale/state';
import type { AppLocale } from '@sniptale/platform/i18n/config';

/** Supply authored viewer messages through its startup transport seam. */
export function loadViewerCatalogFixture(locale: AppLocale): Promise<Record<string, string>> {
  return Promise.resolve(catalogFixtureMessages(locale));
}

/** Direct viewer component tests start with their explicitly selected English catalog. */
export async function prepareViewerTranslations(): Promise<void> {
  await prepareTranslations('web-snapshot-viewer', 'en');
  await setLocalePreference('en');
}

/** Prepare both languages only for the viewer tests that explicitly exercise both. */
export async function prepareViewerBilingualTranslations(): Promise<void> {
  await prepareTranslations('web-snapshot-viewer', 'ru');
  await prepareViewerTranslations();
}
