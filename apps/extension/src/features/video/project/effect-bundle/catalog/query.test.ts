import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import type { EffectBundleCatalogEntry } from './index';
import { getEffectCatalogThemes, queryEffectCatalog } from './query';
import { SUPPORTED_LOCALES } from '@sniptale/runtime-contracts/i18n';
const source = readFileSync(
  'apps/extension/src/features/video/project/effect-bundle/fixtures/retained/callout.sniptale-animation.json',
  'utf8'
);
const catalog: EffectBundleCatalogEntry = {
  documents: [
    {
      id: 'sniptale-callout',
      source,
      kind: 'standalone',
      assets: [],
      schemaVersion: 'sniptale.animation.v1',
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
  source: 'sniptale-animation',
  sourceSha256: 'a'.repeat(64),
  retainedByteLength: source.length,
};
it('expands graph styles and combines localized theme, style, category and search', () => {
  expect(
    queryEffectCatalog(catalog, { query: 'карточки', kind: 'standalone', theme: 'all' }, 'ru')
  ).toHaveLength(3);
  expect(
    queryEffectCatalog(
      catalog,
      { query: '', kind: 'all', theme: 'style:midnight:amber' },
      'en'
    ).map((d) => d.previewPresetId)
  ).toEqual(['midnight-amber']);

  expect(getEffectCatalogThemes([catalog]).map((option) => option.value)).toEqual([
    'theme:midnight',
    'style:midnight:amber',
    'style:midnight:blue',
    'style:midnight:mint',
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
    defaultPreset: { kind: 'builtin' as const, id: 'midnight-blue' },
  };
  const entries = queryEffectCatalog(
    { ...catalog, documents: [{ ...catalog.documents[0]!, presetPreferences: preferences }] },
    { query: '', kind: 'all', theme: 'all' },
    'en'
  );
  expect(entries.map((entry) => entry.previewPresetId)).toEqual([
    'midnight-blue',
    'midnight-amber',
    'midnight-mint',
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

it('hides all styles of disabled documents while Settings can still query and enable them', () => {
  const disabled = {
    ...catalog,
    documents: catalog.documents.map((document) => ({ ...document, enabled: false })),
  };
  const filter = { query: '', kind: 'all' as const, theme: 'all' };
  expect(queryEffectCatalog(disabled, filter, 'en')).toEqual([]);
  expect(getEffectCatalogThemes([disabled])).toEqual([]);
  expect(queryEffectCatalog(disabled, filter, 'en', { includeDisabled: true })).toHaveLength(3);
  expect(getEffectCatalogThemes([disabled], 'en', { includeDisabled: true })).toHaveLength(4);
  expect(queryEffectCatalog(catalog, filter, 'en')).toHaveLength(3);
});

it.each(SUPPORTED_LOCALES)(
  'uses English collection labels when metadata lacks locale %s',
  (locale) => {
    const fallback = { ...catalog, label: { en: 'Unique collection label', ru: '' } };
    expect(
      queryEffectCatalog(
        fallback,
        { query: 'unique collection label', kind: 'all', theme: 'all' },
        locale
      )
    ).toHaveLength(3);
  }
);
