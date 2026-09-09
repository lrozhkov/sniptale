import { expect, it } from 'vitest';
import type { EffectBundleCatalogEntry } from './index';
import { queryEffectCatalog } from './query';
const documents = ['card-light', 'card-dark', 'other'].map((id) => ({
  id,
  source: '{}',
  kind: 'standalone' as const,
  assets: [],
  schemaVersion: 'sniptale.effect.v1' as const,
  sha256: 'a'.repeat(64),
}));
const catalog: EffectBundleCatalogEntry = {
  documents,
  assets: [],
  createdAt: 0,
  updatedAt: 0,
  enabled: true,
  label: { en: 'Cards', ru: 'Карточки' },
  description: { en: '', ru: '' },
  packId: 'cards',
  version: '1.0.0',
  source: 'raw-json',
  sourceSha256: 'a'.repeat(64),
  retainedByteLength: 10,
};
it('combines group, theme and search; unknown themes stay unclassified', () => {
  expect(
    queryEffectCatalog(catalog, { query: 'CARD', kind: 'standalone', theme: 'dark' }, 'en').map(
      (d) => d.id
    )
  ).toEqual(['card-dark']);
  expect(
    queryEffectCatalog(catalog, { query: '', kind: 'all', theme: 'unspecified' }, 'en').map(
      (d) => d.id
    )
  ).toEqual(['other']);
  expect(
    queryEffectCatalog(catalog, { query: '', kind: 'transition', theme: 'all' }, 'en')
  ).toEqual([]);
  expect(
    queryEffectCatalog(catalog, { query: 'карточки', kind: 'all', theme: 'all' }, 'ru')
  ).toHaveLength(3);
});
