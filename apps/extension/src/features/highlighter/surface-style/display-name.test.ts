import {
  loadFeatureCatalogFixture,
  prepareFeatureTranslations,
} from '../../catalog-fixture.test-support';
vi.mock('../../../platform/i18n/catalog-transport', () => ({
  loadCatalogMessages: (locale: Parameters<typeof loadFeatureCatalogFixture>[0]) =>
    loadFeatureCatalogFixture(locale),
}));

import { expect, it, beforeEach, vi } from 'vitest';
import { getSurfaceStylePresetDisplayName } from './display-name';

it('localizes canonical system names and preserves custom names', () => {
  expect(
    getSurfaceStylePresetDisplayName(
      {
        id: 'system-surface-plain',
        name: 'surfaceStyle.system.plain',
        origin: 'system',
      },
      'en'
    )
  ).toBe('Plain');
  expect(
    getSurfaceStylePresetDisplayName(
      { id: 'system-surface-plain', name: 'My surface', origin: 'system' },
      'ru'
    )
  ).toBe('My surface');
});

beforeEach(async () => {
  await prepareFeatureTranslations('content', 'ru');
});
