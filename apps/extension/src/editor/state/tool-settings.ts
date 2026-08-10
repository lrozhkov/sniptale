import type { EditorToolSettings } from '../../features/editor/document/tool-settings-types';
import {
  DEFAULT_EDITOR_TOOL_SETTINGS,
  normalizeEditorFrameSettings,
} from '../../features/editor/document/constants';
import { DEFAULT_BORDER_PRESET } from '../../composition/persistence/highlighter';
import {
  createDrawingToolSettingsPatch,
  createToolSettingsPatch,
  type EditorStoreSet,
} from './helpers';
import type { EditorState } from './types';

type EditorHydrateDefaults = EditorState['hydrateDefaults'];
type EditorToolSettingsUpdaters = Pick<
  EditorState,
  | 'replaceDrawingToolSettings'
  | 'updateDrawingToolSettings'
  | 'updateSelectionDrawingToolSettings'
  | 'updateStepSettings'
  | 'updateSelectionStepSettings'
  | 'updateImageSettings'
  | 'updateSelectionImageSettings'
>;

export function createHydrateDefaultsAction(set: EditorStoreSet): EditorHydrateDefaults {
  return (options = {}) =>
    set((state) => {
      const base = DEFAULT_EDITOR_TOOL_SETTINGS(options.borderPreset ?? DEFAULT_BORDER_PRESET);
      const merged = mergeToolSettings(base, options.toolSettings);
      const toolSettings: EditorToolSettings = {
        ...merged,
        pencil: options.toolSettings?.pencil ? merged.pencil : state.toolSettings.pencil,
        marker: options.toolSettings?.marker ? merged.marker : state.toolSettings.marker,
        shape: options.toolSettings?.shape ? merged.shape : state.toolSettings.shape,
        arrow: options.toolSettings?.arrow ? merged.arrow : state.toolSettings.arrow,
        text: options.toolSettings?.text ? merged.text : state.toolSettings.text,
      };

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
    replaceDrawingToolSettings: (defaults) =>
      set((state) => ({
        toolSettings: {
          ...state.toolSettings,
          ...defaults,
        },
      })),
    updateDrawingToolSettings: (tool, patch) =>
      set((state) => createDrawingToolSettingsPatch(state, 'toolSettings', tool, patch)),
    updateSelectionDrawingToolSettings: (tool, patch) =>
      set((state) => createDrawingToolSettingsPatch(state, 'selectionToolSettings', tool, patch)),
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

function mergeToolSettings(
  base: EditorToolSettings,
  overrides: Partial<EditorToolSettings> | undefined
): EditorToolSettings {
  if (!overrides) {
    return base;
  }

  return {
    pencil: { ...base.pencil, ...overrides.pencil },
    marker: { ...base.marker, ...overrides.marker },
    shape: { ...base.shape, ...overrides.shape },
    arrow: { ...base.arrow, ...overrides.arrow },
    text: { ...base.text, ...overrides.text },
    step: { ...base.step, ...overrides.step },
    image: { ...base.image, ...overrides.image },
  };
}
