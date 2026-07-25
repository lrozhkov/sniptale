import { describe, expect, it } from 'vitest';

import type { BorderPreset } from '../../../features/highlighter/contracts';
import {
  createSystemBorderPresetCatalog,
  SYSTEM_BORDER_PRESET_CATALOG_REVISION,
} from '../../../features/highlighter/presets/catalog';
import { normalizeHighlighterCatalogState } from './catalog-migration';

function createLegacyDefault(overrides: Partial<BorderPreset> = {}): BorderPreset {
  const canonical = createSystemBorderPresetCatalog()[0]!;
  const {
    basedOnRevision: _basedOnRevision,
    customized: _customized,
    origin: _origin,
    systemPresetKey: _systemPresetKey,
    ...legacy
  } = canonical;
  return {
    ...legacy,
    name: 'Стандартная рамка',
    isSystemDefault: true,
    ...overrides,
  };
}

describe('highlighter system catalog migration', () => {
  it('creates the complete enabled catalog for a new installation', () => {
    const result = normalizeHighlighterCatalogState({});

    expect(result.borderPresets.map((preset) => preset.id)).toEqual(
      createSystemBorderPresetCatalog().map((preset) => preset.id)
    );
    expect(result.borderPresets.every((preset) => preset.enabled !== false)).toBe(true);
    expect(result.defaultBorderPresetId).toBe('system-default');
    expect(result.systemPresetCatalogRevision).toBe(SYSTEM_BORDER_PRESET_CATALOG_REVISION);
    expect(result.catalogCustomized).toBe(false);
  });

  it.each(['Стандартная рамка', 'Default border'])(
    'recognizes the untouched legacy orange preset named %s',
    (name) => {
      const result = normalizeHighlighterCatalogState({
        borderPresets: [createLegacyDefault({ name, order: 4 })],
        defaultBorderPresetId: 'system-default',
      });

      expect(result.borderPresets).toHaveLength(8);
      expect(result.borderPresets[0]).toMatchObject({
        id: 'system-default',
        customized: false,
        enabled: true,
        order: 4,
        origin: 'system',
        systemPresetKey: 'system-default',
      });
      expect(result.borderPresets.slice(1).every((preset) => preset.enabled !== false)).toBe(true);
    }
  );

  it.each([
    ['renamed', { name: 'My orange frame' }],
    ['visually changed', { width: 7 }],
  ])('preserves an explicitly %s legacy system preset', (_name, overrides) => {
    const legacy = createLegacyDefault(overrides);
    const result = normalizeHighlighterCatalogState({
      borderPresets: [legacy],
      defaultBorderPresetId: legacy.id,
    });

    expect(result.borderPresets[0]).toMatchObject({
      ...overrides,
      customized: true,
      origin: 'system',
      systemPresetKey: 'system-default',
    });
    expect(result.borderPresets.slice(1).every((preset) => preset.enabled === false)).toBe(true);
    expect(result.catalogCustomized).toBe(true);
  });

  it('keeps new system presets disabled when a legacy catalog already has a user preset', () => {
    const userPreset = createLegacyDefault({
      id: 'user-1',
      isSystemDefault: false,
      name: 'My preset',
      order: 6,
      origin: 'user',
    });
    const result = normalizeHighlighterCatalogState({
      borderPresets: [createLegacyDefault(), userPreset],
      defaultBorderPresetId: 'system-default',
    });

    expect(result.borderPresets.find((preset) => preset.id === 'system-default')?.enabled).toBe(
      true
    );
    expect(result.borderPresets.find((preset) => preset.id === 'user-1')?.enabled).toBe(true);
    expect(
      result.borderPresets
        .filter((preset) => preset.origin === 'system' && preset.id !== 'system-default')
        .every((preset) => preset.enabled === false)
    ).toBe(true);
    expect(result.catalogCustomized).toBe(true);
  });

  it('updates untouched visuals, preserves enabled/default, and restores canonical order', () => {
    const [accent, soft] = createSystemBorderPresetCatalog();
    const result = normalizeHighlighterCatalogState({
      borderPresets: [
        { ...accent!, width: 9, basedOnRevision: 0, enabled: false, order: 7 },
        { ...soft!, basedOnRevision: 0, enabled: true, order: 2 },
      ],
      defaultBorderPresetId: soft!.id,
      systemPresetCatalogRevision: 0,
      catalogCustomized: false,
    });

    expect(result.borderPresets.find((preset) => preset.id === accent!.id)).toMatchObject({
      width: 3,
      enabled: false,
      order: 0,
      basedOnRevision: SYSTEM_BORDER_PRESET_CATALOG_REVISION,
    });
    expect(result.defaultBorderPresetId).toBe(soft!.id);
  });

  it('preserves customized system visuals and appends missing catalog entries disabled', () => {
    const accent = {
      ...createSystemBorderPresetCatalog()[0]!,
      color: '#123456',
      customized: true,
      enabled: true,
      order: 3,
    };
    const result = normalizeHighlighterCatalogState({
      borderPresets: [accent],
      defaultBorderPresetId: accent.id,
      systemPresetCatalogRevision: 0,
      catalogCustomized: true,
    });

    expect(result.borderPresets[0]).toMatchObject({ color: '#123456', customized: true, order: 3 });
    expect(result.borderPresets.slice(1).every((preset) => preset.enabled === false)).toBe(true);
    expect(result.borderPresets.slice(1).map((preset) => preset.order)).toEqual([
      4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('repairs an all-disabled state and default deterministically by order then id', () => {
    const [accent, soft] = createSystemBorderPresetCatalog();
    const result = normalizeHighlighterCatalogState({
      borderPresets: [
        { ...accent!, enabled: false, order: 4 },
        { ...soft!, enabled: false, order: 1 },
      ],
      defaultBorderPresetId: accent!.id,
      systemPresetCatalogRevision: SYSTEM_BORDER_PRESET_CATALOG_REVISION,
      catalogCustomized: true,
    });

    expect(result.borderPresets.find((preset) => preset.id === soft!.id)?.enabled).toBe(true);
    expect(result.defaultBorderPresetId).toBe(soft!.id);
  });

  it('is idempotent and never duplicates catalog entries or re-enables disabled presets', () => {
    const initial = normalizeHighlighterCatalogState({
      borderPresets: createSystemBorderPresetCatalog().map((preset, index) => ({
        ...preset,
        enabled: index !== 3,
      })),
      defaultBorderPresetId: 'system-default',
      systemPresetCatalogRevision: SYSTEM_BORDER_PRESET_CATALOG_REVISION,
      catalogCustomized: true,
    });
    const repeated = normalizeHighlighterCatalogState(initial);

    expect(repeated).toEqual(initial);
    expect(new Set(repeated.borderPresets.map((preset) => preset.id)).size).toBe(8);
    expect(repeated.borderPresets.find((preset) => preset.id === 'system-success')?.enabled).toBe(
      false
    );
  });

  it('preserves and deterministically remaps an explicit user ID colliding with a system key', () => {
    const source = createSystemBorderPresetCatalog()[2]!;
    const {
      basedOnRevision: _basedOnRevision,
      customized: _customized,
      systemPresetKey: _systemPresetKey,
      ...userSource
    } = source;
    const existingUser = {
      ...userSource,
      id: 'system-marker-user',
      name: 'Existing user',
      origin: 'user' as const,
    };
    const collidingUser = {
      ...userSource,
      color: '#123456',
      id: 'system-marker',
      name: 'My marker',
      order: 9,
      origin: 'user' as const,
    };

    const migrated = normalizeHighlighterCatalogState({
      borderPresets: [existingUser, collidingUser],
      defaultBorderPresetId: collidingUser.id,
    });
    const remapped = migrated.borderPresets.find((preset) => preset.id === 'system-marker-user-2');

    expect(remapped).toMatchObject({
      color: '#123456',
      name: 'My marker',
      origin: 'user',
    });
    expect(migrated.borderPresets).toContainEqual(
      expect.objectContaining({ id: 'system-marker', origin: 'system' })
    );
    expect(migrated.defaultBorderPresetId).toBe('system-marker-user-2');
    expect(normalizeHighlighterCatalogState(migrated)).toEqual(migrated);
  });
});
