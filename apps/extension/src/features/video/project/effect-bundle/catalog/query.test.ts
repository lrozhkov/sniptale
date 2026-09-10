import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import type { EffectBundleCatalogEntry } from './index';
import { getEffectCatalogThemes, queryEffectCatalog } from './query';
const source = readFileSync(
  'packages/runtime-contracts/src/effect-v1/fixtures/collection/sniptale-callout.sniptale-effect.json',
  'utf8'
);
const catalog: EffectBundleCatalogEntry = {
  documents: [
    {
      id: 'sniptale-callout',
      source,
      kind: 'standalone',
      assets: [],
      schemaVersion: 'sniptale.effect.v1',
      sha256: 'a'.repeat(64),
    },
  ],
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
  retainedByteLength: source.length,
};
it('expands graph styles and combines localized theme, style, category and search', () => {
  expect(
    queryEffectCatalog(catalog, { query: 'карточки', kind: 'standalone', theme: 'all' }, 'ru')
  ).toHaveLength(2);
  expect(
    queryEffectCatalog(
      catalog,
      { query: '', kind: 'all', theme: 'style:sniptale-orange:dark' },
      'en'
    ).map((d) => d.previewPresetId)
  ).toEqual(['sniptale-orange-dark']);
  expect(
    queryEffectCatalog(catalog, { query: '', kind: 'transition', theme: 'all' }, 'en')
  ).toEqual([]);
  expect(getEffectCatalogThemes([catalog]).map((option) => option.value)).toEqual([
    'theme:sniptale-orange',
    'style:sniptale-orange:dark',
    'style:sniptale-orange:light',
  ]);
});
it('does not infer themes from names and only exposes declared styles', () => {
  const raw = JSON.parse(source);
  delete raw.controlPresets;
  delete raw.defaultControlPresetId;
  expect(
    getEffectCatalogThemes([
      {
        ...catalog,
        documents: [{ ...catalog.documents[0]!, id: 'fake-dark', source: JSON.stringify(raw) }],
      },
    ])
  ).toEqual([]);
  raw.controlPresets = [JSON.parse(source).controlPresets[0]];
  raw.defaultControlPresetId = raw.controlPresets[0].id;
  expect(
    getEffectCatalogThemes([
      { ...catalog, documents: [{ ...catalog.documents[0]!, source: JSON.stringify(raw) }] },
    ])
  ).toHaveLength(2);
});
it('places the selected default first without hiding other variants', () => {
  const preferences = {
    presets: [],
    defaultPreset: { kind: 'builtin' as const, id: 'sniptale-orange-light' },
  };
  const entries = queryEffectCatalog(
    { ...catalog, documents: [{ ...catalog.documents[0]!, presetPreferences: preferences }] },
    { query: '', kind: 'all', theme: 'all' },
    'en'
  );
  expect(entries.map((entry) => entry.previewPresetId)).toEqual([
    'sniptale-orange-light',
    'sniptale-orange-dark',
  ]);
});
it('names and filters user styles even when a graph does not declare a theme', () => {
  const raw = JSON.parse(source);
  delete raw.controlPresets;
  delete raw.defaultControlPresetId;
  const item = {
    ...catalog.documents[0]!,
    source: JSON.stringify(raw),
    presetPreferences: { presets: [{ id: 'mine', name: 'My settings', values: {} }] },
  };
  const next = { ...catalog, documents: [item] };
  expect(getEffectCatalogThemes([next]).map((option) => option.label.trim())).toEqual([
    'My settings',
  ]);
  expect(
    queryEffectCatalog(next, { query: 'My settings', kind: 'all', theme: 'style:user:mine' }, 'en')
  ).toHaveLength(1);
});

it('does not parse the same graph again when playback rerenders catalog variants and themes', () => {
  const fresh = {
    ...catalog,
    documents: catalog.documents.map((d) => ({ ...d, source: d.source + '\n ' })),
  };
  const parse = vi.spyOn(JSON, 'parse');
  try {
    for (let frame = 0; frame < 3; frame++) {
      getEffectCatalogThemes([fresh], 'ru');
      queryEffectCatalog(fresh, { query: '', kind: 'all', theme: 'all' }, 'en');
    }
    expect(parse.mock.calls.filter(([value]) => value === fresh.documents[0]!.source)).toHaveLength(
      1
    );
  } finally {
    parse.mockRestore();
  }
});
