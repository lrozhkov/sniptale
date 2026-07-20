import type { EditorToolSettings } from '../../features/editor/document/tool-settings-types';
import {
  DEFAULT_EDITOR_TOOL_SETTINGS,
  normalizeEditorFrameSettings,
} from '../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../composition/persistence/highlighter';
import { createObjectPatch, createToolSettingsPatch, type EditorStoreSet } from './helpers';
import type { EditorRasterToolSettings } from './raster-tools';
import type { EditorState } from './types';

type EditorHydrateDefaults = EditorState['hydrateDefaults'];
type EditorToolSettingsUpdaters = Pick<
  EditorState,
  | 'updateBrushSettings'
  | 'updateSelectionBrushSettings'
  | 'updateShapeSettings'
  | 'updateSelectionShapeSettings'
  | 'updateBlurSettings'
  | 'updateSelectionBlurSettings'
  | 'updateArrowSettings'
  | 'updateSelectionArrowSettings'
  | 'updateLineSettings'
  | 'updateSelectionLineSettings'
  | 'updateTextSettings'
  | 'updateSelectionTextSettings'
  | 'updateStepSettings'
  | 'updateSelectionStepSettings'
  | 'updateImageSettings'
  | 'updateSelectionImageSettings'
>;

export function createHydrateDefaultsAction(set: EditorStoreSet): EditorHydrateDefaults {
  return (options = {}) =>
    set((state) => {
      const base = DEFAULT_EDITOR_TOOL_SETTINGS(options.borderPreset ?? DEFAULT_BORDER_PRESET);
      const toolSettings = mergeToolSettings(base, options.toolSettings);

      return {
        frame: options.frame
          ? normalizeEditorFrameSettings({
              ...state.frame,
              ...options.frame,
            })
          : state.frame,
        toolSettings,
        selectionToolSettings: toolSettings,
        browserFrame: state.browserFrame,
      };
    });
}

export function createToolSettingsUpdaters(set: EditorStoreSet): EditorToolSettingsUpdaters {
  return {
    updateBrushSettings: (tool, patch) =>
      set((state) => createToolSettingsPatch(state, 'toolSettings', tool, patch)),
    updateSelectionBrushSettings: (tool, patch) =>
      set((state) => createToolSettingsPatch(state, 'selectionToolSettings', tool, patch)),
    updateShapeSettings: (tool, patch) =>
      set((state) => createToolSettingsPatch(state, 'toolSettings', tool, patch)),
    updateSelectionShapeSettings: (tool, patch) =>
      set((state) => createToolSettingsPatch(state, 'selectionToolSettings', tool, patch)),
    updateBlurSettings: (patch) =>
      set((state) => createToolSettingsPatch(state, 'toolSettings', 'blur', patch)),
    updateSelectionBlurSettings: (patch) =>
      set((state) => createToolSettingsPatch(state, 'selectionToolSettings', 'blur', patch)),
    updateArrowSettings: (patch) =>
      set((state) => createToolSettingsPatch(state, 'toolSettings', 'arrow', patch)),
    updateSelectionArrowSettings: (patch) =>
      set((state) => createToolSettingsPatch(state, 'selectionToolSettings', 'arrow', patch)),
    updateLineSettings: (patch) =>
      set((state) => createToolSettingsPatch(state, 'toolSettings', 'line', patch)),
    updateSelectionLineSettings: (patch) =>
      set((state) => createToolSettingsPatch(state, 'selectionToolSettings', 'line', patch)),
    updateTextSettings: (patch) =>
      set((state) => createToolSettingsPatch(state, 'toolSettings', 'text', patch)),
    updateSelectionTextSettings: (patch) =>
      set((state) => createToolSettingsPatch(state, 'selectionToolSettings', 'text', patch)),
    updateStepSettings: (patch) =>
      set((state) => createToolSettingsPatch(state, 'toolSettings', 'step', patch)),
    updateSelectionStepSettings: (patch) =>
      set((state) => createToolSettingsPatch(state, 'selectionToolSettings', 'step', patch)),
    updateImageSettings: (patch) =>
      set((state) => createToolSettingsPatch(state, 'toolSettings', 'image', patch)),
    updateSelectionImageSettings: (patch) =>
      set((state) => createToolSettingsPatch(state, 'selectionToolSettings', 'image', patch)),
  };
}

export function createRasterToolSettingsUpdater(
  set: EditorStoreSet
): EditorState['updateRasterToolSettings'] {
  return (patch) =>
    set((state) => ({
      rasterToolSettings: createObjectPatch<EditorRasterToolSettings>(
        state.rasterToolSettings,
        patch
      ),
    }));
}

function mergeToolSettings(
  base: EditorToolSettings,
  overrides: Partial<EditorToolSettings> | undefined
): EditorToolSettings {
  if (!overrides) {
    return base;
  }

  return {
    pencil: { ...base.pencil, ...overrides.pencil },
    highlighter: { ...base.highlighter, ...overrides.highlighter },
    rectangle: { ...base.rectangle, ...overrides.rectangle },
    ellipse: { ...base.ellipse, ...overrides.ellipse },
    blur: { ...base.blur, ...overrides.blur },
    arrow: { ...base.arrow, ...overrides.arrow },
    line: { ...base.line, ...overrides.line },
    callout: {
      ...base.callout,
      ...overrides.callout,
      style: { ...base.callout.style, ...overrides.callout?.style },
      text: { ...base.callout.text, ...overrides.callout?.text },
    },
    text: { ...base.text, ...overrides.text },
    step: { ...base.step, ...overrides.step },
    image: { ...base.image, ...overrides.image },
  };
}
