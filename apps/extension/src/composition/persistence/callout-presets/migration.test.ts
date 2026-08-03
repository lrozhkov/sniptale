import { expect, it } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';
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
