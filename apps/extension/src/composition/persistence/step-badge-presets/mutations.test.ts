import { expect, it } from 'vitest';
import { resolveStoredStepBadgePresetCatalog } from './migration';
import {
  addStepBadgePreset,
  deleteStepBadgePreset,
  reorderStepBadgePresets,
  resetSystemStepBadgePreset,
  setDefaultStepBadgePreset,
  setStepBadgePresetEnabled,
  updateStepBadgePreset,
} from './mutations';

it('protects systems and the final enabled template while customizing systems in place', () => {
  const catalog = resolveStoredStepBadgePresetCatalog({});
  const one = {
    ...catalog,
    presets: catalog.presets.map((preset, index) => ({ ...preset, enabled: index === 0 })),
  };
  expect(setStepBadgePresetEnabled(one, one.presets[0]!.id, false)).toBeNull();
  expect(deleteStepBadgePreset(catalog, 'system-classic')).toBeNull();
  const updated = updateStepBadgePreset(catalog, {
    id: 'system-classic',
    name: 'Custom',
    settings: catalog.presets[0]!.settings,
  });
  expect(updated?.presets[0]).toMatchObject({ customized: true, name: 'Custom', origin: 'system' });
});

it('adds, updates, orders, defaults, deletes, and resets valid presets', () => {
  const catalog = resolveStoredStepBadgePresetCatalog({});
  const { systemPresetKey: _systemPresetKey, ...source } = catalog.presets[0]!;
  const user = {
    ...source,
    id: 'user-one',
    name: 'User',
    order: catalog.presets.length,
    origin: 'user' as const,
  };
  const added = addStepBadgePreset(catalog, user)!;
  expect(addStepBadgePreset(added, user)).toBeNull();
  const renamed = updateStepBadgePreset(added, { ...user, name: 'Renamed' })!;
  expect(renamed.presets.at(-1)?.name).toBe('Renamed');
  expect(updateStepBadgePreset(catalog, { ...user, id: 'missing' })).toBeNull();
  const reversedIds = [...renamed.presets].reverse().map((preset) => preset.id);
  const reordered = reorderStepBadgePresets(renamed, reversedIds)!;
  expect(reordered.presets.map((preset) => preset.id)).toEqual(reversedIds);
  expect(reorderStepBadgePresets(renamed, ['missing'])).toBeNull();
  expect(
    reorderStepBadgePresets(
      renamed,
      renamed.presets.map(() => user.id)
    )
  ).toBeNull();
  expect(setDefaultStepBadgePreset(reordered, user.id)?.defaultPresetId).toBe(user.id);
  const disabled = setStepBadgePresetEnabled(reordered, user.id, false)!;
  expect(setDefaultStepBadgePreset(disabled, user.id)).toBeNull();
  expect(setStepBadgePresetEnabled(catalog, 'missing', true)).toBeNull();
  expect(deleteStepBadgePreset(reordered, user.id)?.presets).toHaveLength(catalog.presets.length);
  expect(deleteStepBadgePreset(catalog, 'missing')).toBeNull();

  const customized = updateStepBadgePreset(catalog, {
    id: 'system-classic',
    name: 'Changed',
    settings: catalog.presets[0]!.settings,
  })!;
  expect(resetSystemStepBadgePreset(customized, 'system-classic')?.presets[0]).toMatchObject({
    customized: false,
    name: 'system-classic',
  });
  const tagged = {
    ...catalog,
    presets: catalog.presets.map((preset, index) =>
      index === 0 ? { ...preset, tagIds: ['tag-one'] } : preset
    ),
  };
  expect(resetSystemStepBadgePreset(tagged, 'system-classic')?.presets[0]!.tagIds).toEqual([]);
  expect(resetSystemStepBadgePreset(catalog, 'missing')).toBeNull();
});
