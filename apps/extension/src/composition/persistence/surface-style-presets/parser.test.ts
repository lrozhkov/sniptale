import { createSolidPaint } from '@sniptale/foundation/paint';
import { expect, it } from 'vitest';
import { createSurfaceStylePresetCatalog, updateSurfaceStylePresetValues } from './catalog';
import { SURFACE_STYLE_PRESET_MAX_BYTES } from './contracts';
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

it('keeps the twelve system recipes inside the sync payload budget', () => {
  const stored = serializeSurfaceStylePresetCatalog(createSurfaceStylePresetCatalog());
  expect(stored.presets).toHaveLength(12);
  expect(new TextEncoder().encode(JSON.stringify(stored)).byteLength).toBeLessThanOrEqual(
    SURFACE_STYLE_PRESET_MAX_BYTES
  );
});

it('migrates the actual revision 1 system catalog without discarding customization', () => {
  const current = createSurfaceStylePresetCatalog();
  const previousIds = [
    'system-surface-plain',
    'system-surface-frosted-light',
    'system-surface-frosted-dark',
    'system-surface-clear-tint',
    'system-surface-soft-elevated',
  ];
  const previousNames: Record<string, string> = {
    'system-surface-plain': 'surfaceStyle.system.plain',
    'system-surface-frosted-light': 'surfaceStyle.system.frostedLight',
    'system-surface-frosted-dark': 'surfaceStyle.system.frostedDark',
    'system-surface-clear-tint': 'surfaceStyle.system.clearTint',
    'system-surface-soft-elevated': 'surfaceStyle.system.softElevated',
  };
  const previousSystems = previousIds
    .map((id, order) => ({
      ...current.presets.find((preset) => preset.id === id)!,
      name: previousNames[id]!,
      order,
    }))
    .map((preset) => {
      if (preset.id === 'system-surface-frosted-light') {
        return {
          ...preset,
          style: {
            fillPaint: createSolidPaint('#ffffffb8'),
            surfaceCss: 'backdrop-filter: blur(16px) saturate(1.2) brightness(1.04);',
          },
        };
      }
      if (preset.id === 'system-surface-clear-tint') {
        return {
          ...preset,
          style: {
            fillPaint: {
              kind: 'gradient' as const,
              gradient: {
                type: 'linear' as const,
                angle: 135,
                interpolation: 'oklab' as const,
                repeat: { enabled: false, span: 1 },
                stops: [
                  { id: 'clear-tint-start', color: '#60a5fa38', position: 0, midpoint: 0.5 },
                  { id: 'clear-tint-end', color: '#a78bfa2e', position: 1, midpoint: 0.5 },
                ],
              },
            },
            surfaceCss:
              'backdrop-filter: blur(10px) saturate(1.25);\n' +
              'box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);',
          },
        };
      }
      return preset;
    });
  const customizedFrost = {
    ...previousSystems[1]!,
    customized: true,
    enabled: false,
    name: 'My frost',
    order: 0,
    style: { fillPaint: createSolidPaint('#123456'), surfaceCss: 'box-shadow: none;' },
  };
  const customizedPlain = { ...previousSystems[0]!, customized: true, order: 1 };
  const user = {
    ...previousSystems[0]!,
    customized: false,
    id: 'user-kept',
    name: 'Kept',
    order: 5,
    origin: 'user' as const,
  };
  const parsed = parseStoredSurfaceStylePresetState({
    catalogRevision: 7,
    defaultPresetIdBySurface: { 'highlighter-callout': 'system-surface-clear-tint' },
    favoriteIdsBySurface: {
      'highlighter-callout': [
        'system-surface-frosted-light',
        'system-surface-clear-tint',
        'user-kept',
      ],
    },
    presets: [
      customizedFrost,
      customizedPlain,
      previousSystems[2],
      previousSystems[3],
      previousSystems[4],
      user,
    ],
    schemaVersion: 2,
    systemCatalogRevision: 1,
  });

  expect(parsed.catalog.unsafeForWrite).toBe(false);
  expect(parsed.catalog.presets).toHaveLength(13);
  expect(parsed.catalog.presets.at(-1)?.id).toBe('user-kept');
  expect(parsed.catalog.presets.find((preset) => preset.id === customizedFrost.id)).toMatchObject({
    customized: true,
    enabled: false,
    name: 'My frost',
    style: customizedFrost.style,
  });
  expect(
    parsed.catalog.presets.find((preset) => preset.id === 'system-surface-clear-tint')?.style
  ).toEqual(current.presets.find((preset) => preset.id === 'system-surface-clear-tint')?.style);
  expect(
    parsed.catalog.presets.findIndex((preset) => preset.id === customizedFrost.id)
  ).toBeLessThan(parsed.catalog.presets.findIndex((preset) => preset.id === customizedPlain.id));
  expect(parsed.catalog.presets[0]?.id).toBe(customizedFrost.id);
  expect(parsed.catalog.defaultPresetId).toBe('system-surface-clear-tint');
  expect(parsed.catalog.favoriteIds).toEqual([
    'system-surface-frosted-light',
    'system-surface-clear-tint',
    'user-kept',
  ]);
  expect(parseStoredSurfaceStylePresetState(parsed.stored).catalog).toEqual(parsed.catalog);
});
