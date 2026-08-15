import { createSolidPaint } from '@sniptale/foundation/paint';
import { expect, it } from 'vitest';
import {
  addUserSurfaceStylePreset,
  cloneSurfaceStylePresetCatalog,
  deleteUserSurfaceStylePreset,
  reorderSurfaceStylePresetCatalog,
  resetSystemSurfaceStylePreset,
  setDefaultSurfaceStylePreset,
  toggleSurfaceStylePresetEnabled,
  toggleSurfaceStylePresetFavorite,
  updateSurfaceStylePresetValues,
} from './catalog';
import { createSurfaceStylePresetCatalog } from './catalog';

it('owns user CRUD/favorites with copy semantics', () => {
  const initial = createSurfaceStylePresetCatalog();
  expect(deleteUserSurfaceStylePreset(initial, 'system-surface-plain')).toBeNull();
  const added = addUserSurfaceStylePreset(initial, {
    id: 'u',
    name: ' U ',
    origin: 'user',
    style: { fillPaint: createSolidPaint('#fff'), surfaceCss: '' },
  })!;
  expect(added.presets.at(-1)?.name).toBe('U');
  const favorite = toggleSurfaceStylePresetFavorite(added, 'u')!;
  expect(favorite.favoriteIds).toEqual(['u']);
  expect(initial.favoriteIds).toEqual([]);
});

const userPreset = (id: string, order = 0) => ({
  id,
  name: id,
  order,
  origin: 'user' as const,
  style: { fillPaint: createSolidPaint('#fff'), surfaceCss: '' },
});

it('sorts, clones, updates, deletes, and reorders detached user records', () => {
  const initial = createSurfaceStylePresetCatalog({
    catalogRevision: 3,
    favoriteIds: ['two', 'missing', 'two'],
    users: [userPreset('two', 2), userPreset('one', 1)],
  });
  expect(initial.favoriteIds).toEqual(['two']);
  expect(initial.presets.slice(-2).map((preset) => preset.id)).toEqual(['one', 'two']);
  const cloned = cloneSurfaceStylePresetCatalog(initial);
  cloned.favoriteIds.push('one');
  cloned.presets.at(-1)!.style.surfaceCss = 'color: red;';
  expect(initial.favoriteIds).toEqual(['two']);
  expect(initial.presets.at(-1)!.style.surfaceCss).toBe('');

  const updated = updateSurfaceStylePresetValues(initial, 'one', {
    name: ' Renamed ',
    style: { fillPaint: createSolidPaint('#123456'), surfaceCss: 'color: red;' },
  })!;
  expect(updated.presets.find((preset) => preset.id === 'one')).toMatchObject({
    name: 'Renamed',
    style: { surfaceCss: 'color: red;' },
  });
  expect(updateSurfaceStylePresetValues(initial, 'missing', {})).toBeNull();
  expect(updateSurfaceStylePresetValues(initial, 'one', { name: ' ' })).toBeNull();

  expect(reorderSurfaceStylePresetCatalog(initial, ['one'])).toBeNull();
  expect(reorderSurfaceStylePresetCatalog(initial, ['one', 'one'])).toBeNull();
  const systemIds = initial.presets
    .filter((preset) => preset.origin === 'system')
    .map((preset) => preset.id);
  const reordered = reorderSurfaceStylePresetCatalog(initial, [...systemIds, 'two', 'one'])!;
  expect(reordered.presets.slice(-2).map((preset) => preset.id)).toEqual(['two', 'one']);
  const deleted = deleteUserSurfaceStylePreset(reordered, 'two')!;
  expect(deleted.presets.some((preset) => preset.id === 'two')).toBe(false);
  expect(deleted.favoriteIds).toEqual([]);
  expect(toggleSurfaceStylePresetFavorite(initial, 'missing')).toBeNull();
  expect(toggleSurfaceStylePresetFavorite(initial, 'two')?.favoriteIds).toEqual([]);
});

it('edits, disables, defaults, reorders, and resets managed system presets', () => {
  const initial = createSurfaceStylePresetCatalog();
  const first = initial.presets[0]!;
  const second = initial.presets[1]!;
  const edited = updateSurfaceStylePresetValues(initial, first.id, { name: 'Custom' })!;
  expect(edited.presets[0]).toMatchObject({ customized: true, name: 'Custom' });
  expect(toggleSurfaceStylePresetEnabled(initial, first.id)).toBeNull();
  const disabled = toggleSurfaceStylePresetEnabled(initial, second.id)!;
  expect(disabled.presets[1]).toMatchObject({ customized: true, enabled: false });
  expect(setDefaultSurfaceStylePreset(disabled, second.id)).toBeNull();
  const reordered = reorderSurfaceStylePresetCatalog(edited, [
    second.id,
    first.id,
    ...edited.presets.slice(2).map((preset) => preset.id),
  ])!;
  expect(reordered.presets[0]).toMatchObject({ customized: true, id: second.id });
  const reset = resetSystemSurfaceStylePreset(reordered, first.id)!;
  expect(reset.presets[0]).toMatchObject({ customized: false, id: first.id });
});

it('rejects invalid, duplicate, unsafe, and over-capacity user records', () => {
  const initial = createSurfaceStylePresetCatalog();
  const valid = userPreset('valid');
  expect(addUserSurfaceStylePreset({ ...initial, unsafeForWrite: true }, valid)).toBeNull();
  expect(addUserSurfaceStylePreset(initial, { ...valid, origin: 'system' })).toBeNull();
  expect(addUserSurfaceStylePreset(initial, { ...valid, id: '' })).toBeNull();
  expect(addUserSurfaceStylePreset(initial, { ...valid, id: 'x'.repeat(257) })).toBeNull();
  expect(addUserSurfaceStylePreset(initial, { ...valid, name: ' ' })).toBeNull();
  expect(
    addUserSurfaceStylePreset(initial, {
      ...valid,
      style: { ...valid.style, surfaceCss: 'position: fixed;' },
    })
  ).toBeNull();
  const added = addUserSurfaceStylePreset(initial, valid)!;
  expect(addUserSurfaceStylePreset(added, valid)).toBeNull();
  const full = createSurfaceStylePresetCatalog({
    users: Array.from({ length: 50 }, (_, index) => userPreset(`user-${index}`, index)),
  });
  expect(addUserSurfaceStylePreset(full, userPreset('overflow'))).toBeNull();
});
