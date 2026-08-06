import { describe, expect, it } from 'vitest';
import type { CalloutPresetCatalog } from '@sniptale/runtime-contracts/highlighter/callout';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';
import {
  addUserPreset,
  deleteUserPreset,
  reorderPresets,
  resetSystemPreset,
  setDefaultPreset,
  setPresetEnabled,
  updatePreset,
} from './mutations';

function createCatalog(): CalloutPresetCatalog {
  return {
    catalogCustomized: false,
    defaultPresetId: 'system-callout-bubble',
    presets: createSystemCalloutPresetCatalog(),
    systemCatalogRevision: 1,
  };
}

describe('callout preset catalog mutations', () => {
  it('adds, updates, deletes, and rejects invalid user preset transitions', () => {
    const catalog = createCatalog();
    const style = catalog.presets[0]!.style;
    const placement = catalog.presets[0]!.placement;
    const added = addUserPreset(catalog, { id: 'user-one', name: 'One', placement, style })!;
    expect(added.catalogCustomized).toBe(true);
    expect(added.presets.at(-1)).toMatchObject({ enabled: true, origin: 'user' });
    expect(
      addUserPreset(added, { id: 'user-one', name: 'Duplicate', placement, style })
    ).toBeNull();

    const updated = updatePreset(added, {
      id: 'user-one',
      name: ' Updated ',
      placement,
      style: { ...style, surface: { ...style.surface, radius: 17 } },
    })!;
    expect(updated.presets.at(-1)).toMatchObject({ name: 'Updated' });
    expect(
      updatePreset(updated, {
        id: 'user-one',
        name: 'Updated',
        placement,
        style: updated.presets.at(-1)!.style,
      })
    ).toBeNull();
    expect(updatePreset(updated, { id: 'missing', name: 'Missing', placement, style })).toBeNull();

    const deleted = deleteUserPreset(updated, 'user-one')!;
    expect(deleted.presets.some((preset) => preset.id === 'user-one')).toBe(false);
    expect(deleteUserPreset(deleted, 'missing')).toBeNull();
    expect(deleteUserPreset(deleted, 'system-callout-bubble')).toBeNull();
  });

  it('maintains enabled/default invariants and rejects no-op transitions', () => {
    const catalog = createCatalog();
    expect(setDefaultPreset(catalog, catalog.defaultPresetId)).toBeNull();
    expect(setDefaultPreset(catalog, 'missing')).toBeNull();

    const defaultChanged = setDefaultPreset(catalog, 'system-callout-card')!;
    expect(defaultChanged.defaultPresetId).toBe('system-callout-card');
    const disabled = setPresetEnabled(defaultChanged, 'system-callout-card', false)!;
    expect(disabled.defaultPresetId).not.toBe('system-callout-card');
    expect(setPresetEnabled(disabled, 'system-callout-card', false)).toBeNull();
    expect(setPresetEnabled(disabled, 'missing', true)).toBeNull();

    const onlyOne = {
      ...catalog,
      presets: catalog.presets.map((preset, index) => ({ ...preset, enabled: index === 0 })),
    };
    expect(setPresetEnabled(onlyOne, onlyOne.presets[0]!.id, false)).toBeNull();
    expect(setDefaultPreset(disabled, 'system-callout-card')).toBeNull();
  });

  it('reorders partial identifiers and resets customized system presets', () => {
    const catalog = createCatalog();
    const ids = catalog.presets.map((preset) => preset.id);
    expect(reorderPresets(catalog, ids)).toBeNull();
    expect(reorderPresets(catalog, [ids[0]!, ids[0]!])).toBeNull();
    const reordered = reorderPresets(catalog, [ids[2]!, ids[0]!])!;
    expect(reordered.presets.slice(0, 2).map((preset) => preset.id)).toEqual([ids[2], ids[0]]);

    expect(resetSystemPreset(catalog, 'missing')).toBeNull();
    expect(resetSystemPreset(catalog, ids[0]!)).toBeNull();
    const customized = updatePreset(catalog, {
      id: ids[0]!,
      name: 'Changed',
      placement: catalog.presets[0]!.placement,
      style: {
        ...catalog.presets[0]!.style,
        surface: { ...catalog.presets[0]!.style.surface, radius: 33 },
      },
    })!;
    const reset = resetSystemPreset(customized, ids[0]!)!;
    expect(reset.presets[0]).toMatchObject({ customized: false, name: ids[0] });
  });

  it('rejects deleting the final enabled user preset', () => {
    const catalog = createCatalog();
    const style = catalog.presets[0]!.style;
    const userOnly: CalloutPresetCatalog = {
      ...catalog,
      defaultPresetId: 'user-one',
      presets: [
        {
          content: { titleText: '' },
          enabled: true,
          id: 'user-one',
          name: 'One',
          order: 0,
          origin: 'user',
          placement: catalog.presets[0]!.placement,
          style,
        },
      ],
    };
    expect(deleteUserPreset(userOnly, 'user-one')).toBeNull();
  });
});
