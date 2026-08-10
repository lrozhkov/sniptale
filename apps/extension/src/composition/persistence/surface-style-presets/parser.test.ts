import { createSolidPaint } from '@sniptale/foundation/paint';
import { expect, it } from 'vitest';
import { parseStoredSurfaceStylePresetState } from './parser';

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
