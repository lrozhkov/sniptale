import { describe, expect, it } from 'vitest';

import {
  findEditableEditorPreset,
  reorderEditorPresetList,
  replaceEditorPresetCollectionWithResolvedDefault,
  resolveEditorPresetDefaultId,
} from './collections';
import { createDefaultEditorPresetStorageState } from './defaults';
import { parseStoredEditorPresetState, resolveStoredEditorPresetState } from './guards';

describe('editor preset storage state', () => {
  it('resolves enabled defaults and preserves every preset while reordering', () => {
    const presets = [
      { enabled: false, id: 'disabled', name: 'Disabled', order: 0, settings: {} },
      { enabled: true, id: 'enabled', name: 'Enabled', order: 1, settings: {} },
      { enabled: true, id: 'other', name: 'Other', order: 2, settings: {} },
    ];

    expect(resolveEditorPresetDefaultId(presets, 'disabled')).toBe('enabled');
    expect(resolveEditorPresetDefaultId(presets, 'other')).toBe('other');
    expect(reorderEditorPresetList(presets, ['other', 'missing'])).toEqual([
      expect.objectContaining({ id: 'other', order: 0 }),
      expect.objectContaining({ id: 'disabled', order: 1 }),
      expect.objectContaining({ id: 'enabled', order: 2 }),
    ]);
  });

  it('replaces a collection with a valid default and protects system presets from editing', () => {
    const state = createDefaultEditorPresetStorageState();
    const custom = {
      ...state.step.presets[0]!,
      enabled: true,
      id: 'custom',
      isSystemDefault: false,
      name: 'Custom',
    };
    const next = replaceEditorPresetCollectionWithResolvedDefault(
      state,
      'step',
      { defaultPresetId: 'missing', presets: [custom] },
      [custom]
    );

    expect(next.step.defaultPresetId).toBe('custom');
    expect(findEditableEditorPreset(next.step, 'custom')).toEqual(custom);
    expect(findEditableEditorPreset(state.step, state.step.presets[0]!.id)).toBeNull();
  });

  it('parses only current step, scene background, and palette families', () => {
    expect(parseStoredEditorPresetState(undefined)).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      value: {},
    });
    expect(parseStoredEditorPresetState('invalid')).toEqual({
      hasInvalidRoot: true,
      invalidFieldCount: 0,
      value: {},
    });

    const parsed = parseStoredEditorPresetState({
      palette: { sceneBackground: ['#111111', '#ffffff'] },
    });
    expect(parsed.value.palette).toEqual({ sceneBackground: ['#111111', '#ffffff'] });
    expect(
      parseStoredEditorPresetState({ palette: { sceneBackground: ['#111111', 42] } }).value.palette
    ).toBeUndefined();

    const resolved = resolveStoredEditorPresetState(parsed.value);
    expect(resolved.palette.sceneBackground).toEqual(['#111111', '#ffffff']);
    expect(resolved.step.presets.length).toBeGreaterThan(0);
    expect(resolved.sceneBackground.presets.length).toBeGreaterThan(0);
  });

  it('parses valid current collections and counts malformed collection fields', () => {
    const defaults = createDefaultEditorPresetStorageState();
    const parsed = parseStoredEditorPresetState({
      palette: defaults.palette,
      sceneBackground: defaults.sceneBackground,
      step: defaults.step,
    });

    expect(parsed.invalidFieldCount).toBe(0);
    expect(parsed.value.step).toEqual(defaults.step);
    expect(parsed.value.sceneBackground).toEqual(defaults.sceneBackground);

    expect(parseStoredEditorPresetState({ step: 'invalid' }).invalidFieldCount).toBe(1);
    expect(
      parseStoredEditorPresetState({
        step: {
          presets: [null, { id: 'bad' }],
        },
      }).invalidFieldCount
    ).toBe(3);
  });

  it('normalizes empty and custom collections around the canonical system preset', () => {
    const defaults = createDefaultEditorPresetStorageState();
    const empty = resolveStoredEditorPresetState({
      step: { defaultPresetId: 'missing', presets: [] },
    });
    expect(empty.step.presets).toEqual(defaults.step.presets);

    const custom = {
      ...defaults.step.presets[0]!,
      id: 'custom-step',
      isSystemDefault: false,
      name: 'Custom step',
    };
    const resolved = resolveStoredEditorPresetState({
      step: { defaultPresetId: 'custom-step', presets: [custom] },
    });
    expect(resolved.step.presets[0]?.isSystemDefault).toBe(true);
    expect(resolved.step.presets[1]?.id).toBe('custom-step');
    expect(resolved.step.defaultPresetId).toBe('custom-step');
  });
});
