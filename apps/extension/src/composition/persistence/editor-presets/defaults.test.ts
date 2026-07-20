import { describe, expect, it, vi } from 'vitest';

const translateMock = vi.hoisted(() => vi.fn((key: string) => key));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

import {
  cloneEditorPaletteSettings,
  cloneEditorPreset,
  cloneEditorPresetCollection,
  cloneEditorPresetStorageState,
  createDefaultEditorPresetStorageState,
} from './defaults';
import { DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS } from './scene-defaults';

function expectCanonicalSceneBackgroundDefault(
  state: ReturnType<typeof createDefaultEditorPresetStorageState>
) {
  expect(state.sceneBackground.presets[0]?.settings).toEqual(
    DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS
  );
  expect(state.sceneBackground.presets[0]?.settings.sourceImage).toEqual(
    DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS.sourceImage
  );
}

function registerDefaultStorageTest() {
  it('builds detached default storage with system defaults for every family', () => {
    const firstState = createDefaultEditorPresetStorageState();
    const secondState = createDefaultEditorPresetStorageState();

    expect(translateMock).toHaveBeenCalledWith('shared.defaults.defaultEditorPresetName');
    expect(firstState.pencil.presets[0]).toMatchObject({
      enabled: true,
      id: 'system-default',
      isSystemDefault: true,
      name: 'shared.defaults.defaultEditorPresetName',
      order: 0,
    });
    expect(firstState.blur.presets[0]?.settings).toEqual(firstState.blur.presets[0]?.settings);
    expect(firstState.arrow.presets[0]?.settings).toMatchObject({
      dynamicWidth: false,
      variant: 'standard',
      width: 18,
    });
    expectCanonicalSceneBackgroundDefault(firstState);
    expect(firstState.palette.shapeStroke.length).toBeGreaterThan(0);

    firstState.palette.shapeStroke[0] = '#000000';
    firstState.ellipse.presets[0]!.settings.strokeColor = '#ffffff';

    expect(secondState.palette.shapeStroke[0]).not.toBe('#000000');
    expect(secondState.ellipse.presets[0]!.settings.strokeColor).not.toBe('#ffffff');
  });
}

function registerCloneIsolationTest() {
  it('clones presets, collections, palette settings, and storage snapshots without sharing state', () => {
    const state = createDefaultEditorPresetStorageState();
    const presetClone = cloneEditorPreset({
      ...state.ellipse.presets[0]!,
      enabled: false,
    });
    const collectionClone = cloneEditorPresetCollection(state.ellipse);
    const paletteClone = cloneEditorPaletteSettings(state.palette);
    const stateClone = cloneEditorPresetStorageState(state);

    expect(presetClone.enabled).toBe(true);

    collectionClone.presets[0]!.settings.strokeColor = '#123456';
    paletteClone.shapeFill[0] = '#654321';
    stateClone.arrow.presets[0]!.settings.color = '#abcdef';
    stateClone.blur.presets[0]!.settings.amount = 24;
    stateClone.sceneBackground.presets[0]!.settings.sourceImage!.radius = 24;

    expect(state.ellipse.presets[0]!.settings.strokeColor).not.toBe('#123456');
    expect(state.palette.shapeFill[0]).not.toBe('#654321');
    expect(state.arrow.presets[0]!.settings.color).not.toBe('#abcdef');
    expect(state.blur.presets[0]!.settings.amount).not.toBe(24);
    expect(state.sceneBackground.presets[0]!.settings.sourceImage?.radius).not.toBe(24);
  });
}

function registerNonSystemCloneTest() {
  it('preserves the enabled flag for non-system presets when cloning', () => {
    const presetClone = cloneEditorPreset({
      enabled: false,
      id: 'preset-2',
      name: 'User preset',
      order: 1,
      settings: { color: '#abcdef' },
    });

    expect(presetClone.enabled).toBe(false);
  });
}

describe('editor preset defaults', () => {
  registerDefaultStorageTest();
  registerCloneIsolationTest();
  registerNonSystemCloneTest();
});
