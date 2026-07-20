import { describe, expect, it, vi } from 'vitest';

const translateMock = vi.hoisted(() => vi.fn((key: string) => key));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));
import {
  type EditorPaletteSettings,
  type EditorPreset,
  type EditorPresetStorageState,
} from '../../../features/editor/document/presets';
import {
  reorderEditorPresetList,
  replaceEditorPresetCollection,
  resolveEditorPresetDefaultId,
} from './collections';
import { createDefaultEditorPresetStorageState } from './defaults';
import { parseStoredEditorPresetState, resolveStoredEditorPresetState } from './guards';
import { parseRootCollections } from './parsers';
import {
  parseArrowSettings,
  parseBlurSettings,
  parseBrushSettings,
  parseSceneBackgroundSettings,
  parseShapeSettings,
  parseStepSettings,
  parseTextSettings,
} from './setting-parsers';
import { warnAboutInvalidStoredState } from './warnings';

function createState(): EditorPresetStorageState {
  return createDefaultEditorPresetStorageState();
}

function createUserPreset<TSettings>(
  base: TSettings,
  overrides: Partial<EditorPreset<TSettings>> = {}
): EditorPreset<TSettings> {
  return {
    enabled: true,
    id: 'user-preset',
    name: 'User preset',
    order: 1,
    settings: structuredClone(base),
    ...overrides,
  };
}

function createPaletteOverrides(): EditorPaletteSettings {
  return {
    sceneBackground: ['#111111', '#222222'],
    shapeFill: ['#333333', '#444444'],
    shapeStroke: ['#555555', '#666666'],
    textBackground: ['#777777', '#888888'],
    textColor: ['#999999', '#aaaaaa'],
  };
}

function registerCollectionParsingTest() {
  it('resolves defaults, replacement, and ordering for preset collections', () => {
    const state = createState();
    const presets = [
      createUserPreset(state.arrow.presets[0]!.settings, { id: 'first', order: 0 }),
      createUserPreset(state.arrow.presets[0]!.settings, { id: 'second', order: 1 }),
    ];
    const replaced = replaceEditorPresetCollection(state, 'arrow', {
      defaultPresetId: 'second',
      presets,
    });

    expect(resolveEditorPresetDefaultId(presets, 'second')).toBe('second');
    expect(
      resolveEditorPresetDefaultId([{ ...presets[0]!, enabled: false }, presets[1]!], 'first')
    ).toBe('second');
    expect(resolveEditorPresetDefaultId([], undefined)).toBe('system-default');
    expect(replaced.arrow.defaultPresetId).toBe('second');
    expect(reorderEditorPresetList(presets, ['second'])).toEqual([
      expect.objectContaining({ id: 'second', order: 0 }),
      expect.objectContaining({ id: 'first', order: 1 }),
    ]);
  });
}

function createLegacyBrushParserState() {
  const state = createState();
  const { shapeCorrection: _ignored, ...legacyPencilSettings } = {
    ...state.pencil.presets[0]!.settings,
    shadowAngle: undefined,
    shadowColor: undefined,
  };

  return {
    legacyPencilSettings,
    legacyRecognitionDisabledSettings: {
      ...legacyPencilSettings,
      recognitionEnabled: false,
    },
    state,
  };
}

function createLegacyPresetRootPayload() {
  const state = createState();
  const storedPalette = createPaletteOverrides();
  const { shapeCorrection: _pencilShapeCorrection, ...legacyPencilSettings } =
    state.pencil.presets[0]!.settings;
  const { shapeCorrection: _highlighterShapeCorrection, ...legacyHighlighterSettings } =
    state.highlighter.presets[0]!.settings;

  return {
    payload: {
      arrow: {
        defaultPresetId: 'user-preset',
        presets: [createUserPreset(state.arrow.presets[0]!.settings)],
      },
      blur: {
        defaultPresetId: 'user-blur',
        presets: [createUserPreset(state.blur.presets[0]!.settings, { id: 'user-blur' })],
      },
      highlighter: {
        defaultPresetId: 'legacy-highlighter',
        presets: [createUserPreset(legacyHighlighterSettings, { id: 'legacy-highlighter' })],
      },
      palette: storedPalette,
      pencil: {
        defaultPresetId: 'legacy-pencil',
        presets: [createUserPreset(legacyPencilSettings, { id: 'legacy-pencil' })],
      },
    },
    storedPalette,
  };
}

function registerBrushParserCompatibilityTest() {
  it('maps legacy pencil recognition settings onto shape correction modes', () => {
    const { state, legacyPencilSettings, legacyRecognitionDisabledSettings } =
      createLegacyBrushParserState();

    expect(parseBrushSettings(state.pencil.presets[0]!.settings)).toEqual(
      state.pencil.presets[0]!.settings
    );
    expect(parseBrushSettings(legacyPencilSettings)).toEqual({
      ...state.pencil.presets[0]!.settings,
      shapeCorrection: 'subtle',
    });
    expect(parseBrushSettings(legacyRecognitionDisabledSettings)).toEqual({
      ...state.pencil.presets[0]!.settings,
      shapeCorrection: 'off',
    });
  });
}

function registerBrushParserValidationTest() {
  it('rejects malformed brush settings and invalid shape correction values', () => {
    const { state } = createLegacyBrushParserState();

    expect(
      parseBrushSettings({
        ...state.pencil.presets[0]!.settings,
        shapeCorrection: 'invalid',
      })
    ).toBeNull();
    expect(parseBrushSettings({ width: 'wide' })).toBeNull();
  });
}

function registerFamilyParserTest() {
  it('parses the remaining preset families and rejects malformed contracts', () => {
    const state = createState();

    expect(parseShapeSettings(state.ellipse.presets[0]!.settings)).toEqual(
      state.ellipse.presets[0]!.settings
    );
    expect(parseArrowSettings(state.arrow.presets[0]!.settings)).toEqual(
      state.arrow.presets[0]!.settings
    );
    expect(parseBlurSettings(state.blur.presets[0]!.settings)).toEqual(
      state.blur.presets[0]!.settings
    );
    expect(parseTextSettings(state.text.presets[0]!.settings)).toEqual(
      state.text.presets[0]!.settings
    );
    expect(parseStepSettings(state.step.presets[0]!.settings)).toEqual(
      state.step.presets[0]!.settings
    );
    expect(parseSceneBackgroundSettings(state.sceneBackground.presets[0]!.settings)).toEqual(
      state.sceneBackground.presets[0]!.settings
    );
    expect(parseShapeSettings({ strokeStyle: 'double' })).toBeNull();
    expect(parseArrowSettings({ mode: 'zigzag' })).toBeNull();
    expect(parseBlurSettings({ blurType: 'mosaic' })).toBeNull();
    expect(parseTextSettings({ fontFamily: 'comic-sans' })).toBeNull();
    expect(parseStepSettings({ alphabet: 'greek' })).toBeNull();
    expect(parseSceneBackgroundSettings({ backgroundImageFit: 'crop' })).toBeNull();
  });
}

function registerRootParserFallbackTest() {
  it('parses root collections and restores legacy pencil/highlighter fallback modes', () => {
    const { payload, storedPalette } = createLegacyPresetRootPayload();
    const parsedRoot = parseRootCollections(payload);

    expect(parsedRoot.arrow.collection?.presets).toHaveLength(1);
    expect(parsedRoot.blur.collection?.presets).toHaveLength(1);
    expect(parsedRoot.pencil.collection?.presets[0]?.settings).toMatchObject({
      shapeCorrection: 'subtle',
    });
    expect(parsedRoot.highlighter.collection?.presets[0]?.settings).toMatchObject({
      shapeCorrection: 'off',
    });
    expect(parsedRoot.pencil.invalidFieldCount).toBe(0);
    expect(parsedRoot.palette).toEqual(storedPalette);
  });
}

function registerStoredStateResolutionTest() {
  it('resolves parsed storage state, defaults, and invalid roots', () => {
    const { payload, storedPalette } = createLegacyPresetRootPayload();
    const parsedStorage = parseStoredEditorPresetState(payload);
    const resolved = resolveStoredEditorPresetState(parsedStorage.value);

    expect(parsedStorage.hasInvalidRoot).toBe(false);
    expect(parsedStorage.invalidFieldCount).toBe(0);
    expect(resolveStoredEditorPresetState({}).ellipse.presets[0]!.isSystemDefault).toBe(true);
    expect(resolved.arrow.defaultPresetId).toBe('user-preset');
    expect(resolved.arrow.presets[0]!.isSystemDefault).toBe(true);
    expect(resolved.arrow.presets[1]).toMatchObject({ id: 'user-preset' });
    expect(resolved.blur.defaultPresetId).toBe('user-blur');
    expect(resolved.pencil.defaultPresetId).toBe('legacy-pencil');
    expect(resolved.highlighter.defaultPresetId).toBe('legacy-highlighter');
    expect(resolved.palette).toEqual(storedPalette);
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
function registerInvalidPaletteParserTest() {
  it('drops malformed palette sections from parsed root collections', () => {
    const parsedRoot = parseRootCollections({
      palette: {
        sceneBackground: ['#111111'],
        shapeFill: ['#222222'],
        shapeStroke: 'broken',
        textBackground: ['#333333'],
        textColor: ['#444444'],
      },
    });

    expect(parsedRoot.palette).toBeUndefined();
  });
}

function registerWarningTest() {
  it('emits warning messages for invalid roots and dropped fields', () => {
    const logger = { warn: vi.fn() };

    warnAboutInvalidStoredState({ hasInvalidRoot: true, invalidFieldCount: 3, logger });

    expect(logger.warn).toHaveBeenNthCalledWith(
      1,
      'Ignoring invalid editor preset settings payload root from storage'
    );
    expect(logger.warn).toHaveBeenNthCalledWith(
      2,
      'Dropped invalid editor preset settings fields from storage',
      { invalidFieldCount: 3 }
    );
  });
}

function registerEditorPresetParsingTests() {
  registerCollectionParsingTest();
  registerBrushParserCompatibilityTest();
  registerBrushParserValidationTest();
  registerFamilyParserTest();
  registerRootParserFallbackTest();
  registerStoredStateResolutionTest();
  registerInvalidPaletteParserTest();
  registerWarningTest();
}

describe('editor preset parsing helpers', registerEditorPresetParsingTests);
