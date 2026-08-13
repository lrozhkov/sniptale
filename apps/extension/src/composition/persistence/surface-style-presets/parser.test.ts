import { createSolidPaint } from '@sniptale/foundation/paint';
import { expect, it } from 'vitest';
import { createSurfaceStylePresetCatalog, updateSurfaceStylePresetValues } from './catalog';
import { parseStoredSurfaceStylePresetState, serializeSurfaceStylePresetCatalog } from './parser';

it('shows only systems and blocks writes for malformed or future state', () => {
  for (const value of [{ schemaVersion: 2 }, { schemaVersion: 1, userPresets: 'bad' }]) {
    const parsed = parseStoredSurfaceStylePresetState(value);
    expect(parsed.catalog.unsafeForWrite).toBe(true);
    expect(parsed.catalog.presets.every((preset) => preset.origin === 'system')).toBe(true);
  }
});

it('parses only user snapshots and favorites from v1', () => {
  const parsed = parseStoredSurfaceStylePresetState({
    schemaVersion: 1,
    catalogRevision: 3,
    systemCatalogRevision: 1,
    userPresets: [
      {
        id: 'u',
        name: 'User',
        origin: 'user',
        order: 0,
        style: { fillPaint: createSolidPaint('#fff'), surfaceCss: '' },
      },
    ],
    favoriteIdsBySurface: { 'highlighter-callout': ['u'] },
  });
  expect(parsed.catalog.catalogRevision).toBe(3);
  expect(parsed.catalog.favoriteIds).toEqual(['u']);
  expect(parsed.catalog.presets.at(-1)?.id).toBe('u');
});

it('rejects unsupported versions and malformed current or v1 containers and origins', () => {
  const current = serializeSurfaceStylePresetCatalog(createSurfaceStylePresetCatalog());
  const { favoriteIdsBySurface: _favorites, ...currentWithoutFavorites } = current;
  for (const value of [
    { ...current, schemaVersion: 0 },
    { ...current, schemaVersion: -1 },
    currentWithoutFavorites,
    { ...current, favoriteIdsBySurface: [] },
    {
      schemaVersion: 1,
      catalogRevision: 0,
      systemCatalogRevision: 1,
      userPresets: [],
    },
    {
      schemaVersion: 1,
      catalogRevision: 0,
      systemCatalogRevision: 1,
      userPresets: [],
      favoriteIdsBySurface: [],
    },
    {
      schemaVersion: 1,
      catalogRevision: 0,
      systemCatalogRevision: 1,
      userPresets: [
        {
          id: 'spoofed-system',
          name: 'Spoofed',
          origin: 'system',
          order: 0,
          style: { fillPaint: createSolidPaint('#fff'), surfaceCss: '' },
        },
      ],
      favoriteIdsBySurface: {},
    },
  ]) {
    expect(parseStoredSurfaceStylePresetState(value).catalog.unsafeForWrite).toBe(true);
  }
});

it('fails stored resource-bearing Surface CSS closed', () => {
  const parsed = parseStoredSurfaceStylePresetState({
    schemaVersion: 1,
    catalogRevision: 3,
    systemCatalogRevision: 1,
    userPresets: [
      {
        id: 'unsafe',
        name: 'Unsafe',
        origin: 'user',
        order: 0,
        style: {
          fillPaint: createSolidPaint('#fff'),
          surfaceCss: 'background-image: s/**/rc("https://attacker.example/pixel");',
        },
      },
    ],
    favoriteIdsBySurface: {},
  });
  expect(parsed.catalog.unsafeForWrite).toBe(true);
  expect(parsed.catalog.presets.every((preset) => preset.origin === 'system')).toBe(true);
});

it('round-trips v2 system customization, enabled state, default, and order', () => {
  const base = createSurfaceStylePresetCatalog();
  const edited = updateSurfaceStylePresetValues(base, base.presets[1]!.id, {
    name: 'Custom glass',
  })!;
  edited.presets[2]!.enabled = false;
  edited.presets[2]!.customized = true;
  const parsed = parseStoredSurfaceStylePresetState(serializeSurfaceStylePresetCatalog(edited));
  expect(parsed.catalog.unsafeForWrite).toBe(false);
  expect(parsed.catalog.presets[1]).toMatchObject({
    customized: true,
    name: 'Custom glass',
  });
  expect(parsed.catalog.presets[2]).toMatchObject({ customized: true, enabled: false });
  expect(parsed.catalog.defaultPresetId).toBe(base.defaultPresetId);
});
