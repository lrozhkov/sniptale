import { describe, expect, it, vi } from 'vitest';

const translateMock = vi.hoisted(() => vi.fn((key: string) => key));

vi.mock('../../../platform/i18n', async () => ({
  ...(await vi.importActual<typeof import('../../../platform/i18n')>('../../../platform/i18n')),
  translate: translateMock,
}));

import { createDefaultEditorPresetStorageState } from './defaults';
import { parseStoredEditorPresetState, resolveStoredEditorPresetState } from './guards';
import { parseSceneBackgroundSettings } from './setting-parsers';
import { DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS } from './scene-defaults';

function createDefaultsState() {
  return createDefaultEditorPresetStorageState();
}

function registerRootValidationTest() {
  it('parses undefined and invalid stored roots defensively', () => {
    expect(parseStoredEditorPresetState(undefined)).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      value: {},
    });
    expect(parseStoredEditorPresetState('broken-root')).toEqual({
      hasInvalidRoot: true,
      invalidFieldCount: 0,
      value: {},
    });
  });
}

function registerParsedRootCollectionTest() {
  it('parses valid root collections into partial preset state', () => {
    const defaults = createDefaultsState();
    const parsed = parseStoredEditorPresetState({
      arrow: {
        defaultPresetId: 'arrow-default',
        presets: [
          {
            enabled: true,
            id: 'arrow-default',
            name: 'Arrow',
            order: 0,
            settings: defaults.arrow.presets[0]?.settings,
          },
        ],
      },
      palette: {
        sceneBackground: ['#111111'],
        shapeFill: ['#222222'],
        shapeStroke: ['#333333'],
        textBackground: ['#444444'],
        textColor: ['#555555'],
      },
    });

    expect(parsed.hasInvalidRoot).toBe(false);
    expect(parsed.invalidFieldCount).toBe(0);
    expect(parsed.value.arrow?.defaultPresetId).toBe('arrow-default');
    expect(parsed.value.palette).toEqual({
      sceneBackground: ['#111111'],
      shapeFill: ['#222222'],
      shapeStroke: ['#333333'],
      textBackground: ['#444444'],
      textColor: ['#555555'],
    });
  });
}

function registerAdditionalFamilyParsingTest() {
  it('keeps parsed ellipse, blur, text, step, and scene background collections', () => {
    const defaults = createDefaultsState();
    const parsed = parseStoredEditorPresetState({
      blur: {
        defaultPresetId: 'blur-default',
        presets: [{ id: 'blur-default', settings: defaults.blur.presets[0]?.settings }],
      },
      ellipse: {
        defaultPresetId: 'ellipse-default',
        presets: [{ id: 'ellipse-default', settings: defaults.ellipse.presets[0]?.settings }],
      },
      sceneBackground: {
        defaultPresetId: 'scene-default',
        presets: [{ id: 'scene-default', settings: defaults.sceneBackground.presets[0]?.settings }],
      },
      step: {
        defaultPresetId: 'step-default',
        presets: [{ id: 'step-default', settings: defaults.step.presets[0]?.settings }],
      },
      text: {
        defaultPresetId: 'text-default',
        presets: [{ id: 'text-default', settings: defaults.text.presets[0]?.settings }],
      },
    });

    expect(parsed.value.blur?.defaultPresetId).toBe('blur-default');
    expect(parsed.value.ellipse?.defaultPresetId).toBe('ellipse-default');
    expect(parsed.value.text?.defaultPresetId).toBe('text-default');
    expect(parsed.value.step?.defaultPresetId).toBe('step-default');
    expect(parsed.value.sceneBackground?.defaultPresetId).toBe('scene-default');
  });
}

function registerSceneSourceImageParsingTest() {
  it('normalizes source image styling in scene background settings', () => {
    const defaults = createDefaultsState();
    const minimalScene = parseSceneBackgroundSettings({
      backgroundColor: '#fff',
      backgroundGradientAngle: 90,
      backgroundGradientFrom: '#000',
      backgroundGradientTo: '#fff',
      backgroundMode: 'color',
    });
    expect(minimalScene?.paddingTop).toBe(defaults.sceneBackground.presets[0]!.settings.paddingTop);
    expect(minimalScene?.sourceImage).toEqual(
      defaults.sceneBackground.presets[0]!.settings.sourceImage
    );

    const parsed = parseSceneBackgroundSettings({
      ...defaults.sceneBackground.presets[0]!.settings,
      sourceImage: {
        opacity: 0.4,
        radius: 11,
        strokeColor: '#123456',
        strokeOpacity: 0.3,
        strokeStyle: 'dot',
        strokeWidth: 2,
      },
    });

    expect(parsed?.sourceImage).toEqual(
      expect.objectContaining({
        opacity: 0.4,
        radius: 11,
        strokeColor: '#123456',
        strokeStyle: 'dot',
      })
    );
    expect(
      parseSceneBackgroundSettings({
        ...defaults.sceneBackground.presets[0]!.settings,
        sourceImage: null,
      })?.sourceImage
    ).toEqual(defaults.sceneBackground.presets[0]!.settings.sourceImage);
  });
}

function registerInvalidFieldCountTest() {
  it('counts invalid preset fields that are dropped during parsing', () => {
    const parsed = parseStoredEditorPresetState({
      arrow: {
        defaultPresetId: 'broken-arrow',
        presets: [{ id: 'broken-arrow', settings: { mode: 'zigzag' } }],
      },
    });

    expect(parsed.hasInvalidRoot).toBe(false);
    expect(parsed.invalidFieldCount).toBeGreaterThan(0);
  });
}

function registerDefaultResolutionTest() {
  it('resolves empty storage snapshots back to built-in defaults', () => {
    const resolved = resolveStoredEditorPresetState({});

    expect(resolved.arrow.presets[0]).toMatchObject({
      enabled: true,
      id: 'system-default',
      isSystemDefault: true,
    });
    expect(resolved.sceneBackground.defaultPresetId).toBe('system-default');
  });
}

function registerSystemDefaultPrependTest() {
  it('prepends a built-in system default when stored collections do not include one', () => {
    const defaults = createDefaultsState();
    const resolved = resolveStoredEditorPresetState({
      arrow: {
        defaultPresetId: 'user-preset',
        presets: [
          {
            enabled: true,
            id: 'user-preset',
            name: 'User preset',
            order: 1,
            settings: defaults.arrow.presets[0]!.settings,
          },
        ],
      },
    });

    expect(resolved.arrow.presets[0]).toMatchObject({
      enabled: true,
      id: 'system-default',
      isSystemDefault: true,
    });
    expect(resolved.arrow.presets[1]).toMatchObject({ id: 'user-preset' });
    expect(resolved.arrow.defaultPresetId).toBe('user-preset');
  });
}

function registerEmptyFallbackBranchTest() {
  it('returns an empty collection when mocked defaults expose no fallback presets', async () => {
    vi.resetModules();
    vi.doMock('./defaults', () => ({
      cloneEditorPaletteSettings: <T>(settings: T) => settings,
      cloneEditorPreset: <T>(preset: T) => preset,
      cloneEditorPresetCollection: <T>(collection: T) => collection,
      cloneEditorPresetStorageState: <T>(settings: T) => settings,
      createDefaultEditorPresetStorageState: () => ({
        arrow: { defaultPresetId: 'system-default', presets: [] },
        blur: { defaultPresetId: 'system-default', presets: [] },
        ellipse: { defaultPresetId: 'system-default', presets: [] },
        highlighter: { defaultPresetId: 'system-default', presets: [] },
        line: { defaultPresetId: 'system-default', presets: [] },
        palette: {
          sceneBackground: [],
          shapeFill: [],
          shapeStroke: [],
          textBackground: [],
          textColor: [],
        },
        pencil: { defaultPresetId: 'system-default', presets: [] },
        sceneBackground: { defaultPresetId: 'system-default', presets: [] },
        step: { defaultPresetId: 'system-default', presets: [] },
        text: { defaultPresetId: 'system-default', presets: [] },
      }),
      EDITOR_PRESETS_STORAGE_KEY: 'sniptale_editor_presets',
    }));

    const { resolveStoredEditorPresetState: resolveWithEmptyFallback } = await import('./guards');
    const resolved = resolveWithEmptyFallback({});

    expect(resolved.arrow).toEqual({
      defaultPresetId: 'system-default',
      presets: [],
    });

    vi.resetModules();
    vi.doUnmock('./defaults');
  });
}

const LEGACY_SYSTEM_SCENE_BACKGROUND_SETTINGS = {
  paddingTop: 12,
  paddingRight: 12,
  paddingBottom: 12,
  paddingLeft: 12,
  backgroundColor: 'transparent',
  backgroundGradientAngle: 90,
  backgroundGradientFrom: '#000000',
  backgroundGradientTo: '#ffffff',
  backgroundImageData: null,
  backgroundImageFit: 'cover' as const,
  backgroundMode: 'color' as const,
  layoutMode: 'fit-image' as const,
};

function registerSystemDefaultRefreshTest() {
  it('refreshes stored system-default scene backgrounds to the latest built-in baseline', () => {
    const resolved = resolveStoredEditorPresetState({
      sceneBackground: {
        defaultPresetId: 'system-default',
        presets: [
          {
            enabled: true,
            id: 'system-default',
            isSystemDefault: true,
            name: 'Legacy default',
            order: 0,
            settings: LEGACY_SYSTEM_SCENE_BACKGROUND_SETTINGS,
          },
        ],
      },
    });

    expect(resolved.sceneBackground.presets[0]).toMatchObject({
      enabled: true,
      id: 'system-default',
      isSystemDefault: true,
      settings: DEFAULT_SCENE_BACKGROUND_PRESET_SETTINGS,
    });
  });
}

describe('editor preset guards', () => {
  registerRootValidationTest();
  registerParsedRootCollectionTest();
  registerAdditionalFamilyParsingTest();
  registerSceneSourceImageParsingTest();
  registerInvalidFieldCountTest();
  registerDefaultResolutionTest();
  registerSystemDefaultPrependTest();
  registerEmptyFallbackBranchTest();
  registerSystemDefaultRefreshTest();
});
