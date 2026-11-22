import { vi } from 'vitest';
import { catalogFixtureMessages } from '../platform/i18n/catalog-fixture.test-support';
import * as localeState from '../platform/i18n/locale/state';
import type { AppLocale } from '@sniptale/platform/i18n/config';

/** Supply local authored data to direct offscreen operation tests. */
export function loadOffscreenCatalogFixture(locale: AppLocale): Promise<Record<string, string>> {
  return Promise.resolve(catalogFixtureMessages(locale));
}

/** Prepare the operation language without requiring browser storage in a Node test. */
export async function prepareOffscreenTranslations(locale: AppLocale): Promise<void> {
  await localeState.prepareTranslations('offscreen', locale);
  vi.spyOn(localeState, 'getCurrentLocale').mockReturnValue(locale);
}
