import { expect, it } from 'vitest';
import {
  createSystemCalloutPresetCatalog,
  SYSTEM_CALLOUT_PRESET_CATALOG_REVISION,
} from '../../../features/highlighter/callout-presets/catalog';
import { resolveStoredCalloutPresetCatalog, serializeCalloutPresetCatalog } from './migration';

it('creates a fully enabled default catalog and compactly round-trips it', () => {
  const fresh = resolveStoredCalloutPresetCatalog({});
  expect(fresh.presets).toHaveLength(6);
  expect(fresh.defaultPresetId).toBe('system-callout-bubble');
  expect(fresh.presets.every((preset) => preset.enabled !== false)).toBe(true);
  expect(resolveStoredCalloutPresetCatalog(serializeCalloutPresetCatalog(fresh))).toEqual(fresh);
});

it('preserves customized systems and appends missing canonical systems disabled', () => {
  const bubble = createSystemCalloutPresetCatalog()[0]!;
  const style = { ...bubble.style, surface: { ...bubble.style.surface, radius: 33 } };
  const migrated = resolveStoredCalloutPresetCatalog({
    catalogCustomized: true,
    defaultPresetId: bubble.id,
    placements: [{ id: bubble.id, enabled: true, order: 4 }],
    systemCatalogRevision: 0,
    systemOverrides: [{ name: 'Custom bubble', style, systemPresetKey: bubble.systemPresetKey! }],
  });
  expect(migrated.presets.find((preset) => preset.id === bubble.id)).toMatchObject({
    customized: true,
    name: 'Custom bubble',
    style: { surface: { radius: 33 } },
  });
  expect(
    migrated.presets
      .filter((preset) => preset.id !== bubble.id)
      .every((preset) => preset.enabled === false)
  ).toBe(true);
});

it('upgrades untouched system presets but preserves explicit customized overrides', () => {
  const bubble = createSystemCalloutPresetCatalog()[0]!;
  const staleStyle = {
    ...bubble.style,
    surface: { ...bubble.style.surface, radius: bubble.style.surface.radius + 10 },
  };
  const untouched = resolveStoredCalloutPresetCatalog({
    systemCatalogRevision: 1,
    systemOverrides: [
      {
        basedOnRevision: 1,
        customized: false,
        name: bubble.name,
        style: staleStyle,
        systemPresetKey: bubble.systemPresetKey!,
      },
    ],
  });
  expect(untouched.presets.find((preset) => preset.id === bubble.id)).toMatchObject({
    basedOnRevision: bubble.basedOnRevision,
    customized: false,
    style: { surface: { radius: bubble.style.surface.radius } },
  });

  const customized = resolveStoredCalloutPresetCatalog({
    systemCatalogRevision: 1,
    systemOverrides: [
      {
        basedOnRevision: 1,
        customized: true,
        name: 'Custom bubble',
        style: staleStyle,
        systemPresetKey: bubble.systemPresetKey!,
      },
    ],
  });
  expect(customized.presets.find((preset) => preset.id === bubble.id)).toMatchObject({
    basedOnRevision: 1,
    customized: true,
    name: 'Custom bubble',
    style: { surface: { radius: staleStyle.surface.radius } },
  });
  expect(serializeCalloutPresetCatalog(customized).systemOverrides?.[0]).toMatchObject({
    basedOnRevision: 1,
    customized: true,
  });
});

it('upgrades the untouched legacy pointer preset to the canonical ring-dot design', () => {
  const migrated = resolveStoredCalloutPresetCatalog({
    systemCatalogRevision: 2,
    placements: [{ id: 'system-callout-pointer-note', enabled: true, order: 0 }],
  });

  expect(
    migrated.presets.find((preset) => preset.id === 'system-callout-pointer-note')
  ).toMatchObject({
    basedOnRevision: SYSTEM_CALLOUT_PRESET_CATALOG_REVISION,
    customized: false,
    style: { connector: { frameMarker: 'ring-dot', frameMarkerSize: 12 } },
  });
});

it('migrates legacy user presets to a deterministic default position', () => {
  const style = createSystemCalloutPresetCatalog()[0]!.style;
  const migrated = resolveStoredCalloutPresetCatalog({
    userPresets: [{ id: 'user-legacy', name: 'Legacy', style }],
  });

  expect(migrated.presets.find((preset) => preset.id === 'user-legacy')?.placement).toEqual({
    anchor: 'top-center',
    side: 'top',
  });
});
