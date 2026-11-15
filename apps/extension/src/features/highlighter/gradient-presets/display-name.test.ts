import {
  loadFeatureCatalogFixture,
  prepareFeatureTranslations,
} from '../../catalog-fixture.test-support';
vi.mock('../../../platform/i18n/catalog-transport', () => ({
  loadCatalogMessages: (locale: Parameters<typeof loadFeatureCatalogFixture>[0]) =>
    loadFeatureCatalogFixture(locale),
}));

import { expect, it, beforeEach, vi } from 'vitest';
import { getGradientPresetDisplayName } from './display-name';

it('localizes canonical system names and preserves custom names', () => {
  expect(
    getGradientPresetDisplayName(
      { id: 'system-sunset', name: 'system-sunset', origin: 'system' },
      'en'
    )
  ).toBe('Sunset');
  expect(
    getGradientPresetDisplayName(
      { id: 'system-sunset', name: 'My gradient', origin: 'system' },
      'ru'
    )
  ).toBe('My gradient');
});

beforeEach(async () => {
  await prepareFeatureTranslations('content', 'ru');
});
