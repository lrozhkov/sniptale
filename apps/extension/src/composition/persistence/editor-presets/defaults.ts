import {
  DEFAULT_EDITOR_TOOL_SETTINGS,
  EDITOR_SCENE_BACKGROUND_PALETTE,
  EDITOR_TOOL_SHAPE_FILL_PALETTE,
  EDITOR_TOOL_SHAPE_STROKE_PALETTE,
  EDITOR_TOOL_TEXT_BACKGROUND_PALETTE,
  EDITOR_TOOL_TEXT_COLOR_PALETTE,
} from '../../../features/editor/document/constants';
import type {
  EditorPaletteSettings,
  EditorPreset,
  EditorPresetCollection,
  EditorPresetSettingsMap,
  EditorPresetStorageState,
} from '../../../features/editor/document/presets';
import { translate } from '../../../platform/i18n';
import { DEFAULT_BORDER_PRESET } from '../highlighter';
import { createDefaultSceneBackgroundSettings } from './scene-defaults';

export const EDITOR_PRESETS_STORAGE_KEY = 'sniptale_editor_presets';
const DEFAULT_EDITOR_PRESET_NAME = translate('shared.defaults.defaultEditorPresetName');
const DEFAULT_EDITOR_PRESET_ID = 'system-default';

const DEFAULT_EDITOR_PALETTE_SETTINGS: EditorPaletteSettings = {
  shapeStroke: [...EDITOR_TOOL_SHAPE_STROKE_PALETTE],
  shapeFill: [...EDITOR_TOOL_SHAPE_FILL_PALETTE],
  textColor: [...EDITOR_TOOL_TEXT_COLOR_PALETTE],
  textBackground: [...EDITOR_TOOL_TEXT_BACKGROUND_PALETTE],
  sceneBackground: [...EDITOR_SCENE_BACKGROUND_PALETTE],
};

function createSystemPreset<TSettings>(settings: TSettings): EditorPreset<TSettings> {
  return {
    id: DEFAULT_EDITOR_PRESET_ID,
    name: DEFAULT_EDITOR_PRESET_NAME,
    order: 0,
    enabled: true,
    isSystemDefault: true,
    settings: structuredClone(settings),
  };
}

function createDefaultCollection<TKey extends keyof EditorPresetSettingsMap>(
  settings: EditorPresetSettingsMap[TKey]
): EditorPresetCollection<EditorPresetSettingsMap[TKey]> {
  return {
    defaultPresetId: DEFAULT_EDITOR_PRESET_ID,
    presets: [createSystemPreset(settings)],
  };
}

export function cloneEditorPreset<TSettings>(
  preset: EditorPreset<TSettings>
): EditorPreset<TSettings> {
  return {
    ...preset,
    enabled: preset.isSystemDefault ? true : preset.enabled,
    settings: structuredClone(preset.settings),
  };
}

export function cloneEditorPresetCollection<TSettings>(
  collection: EditorPresetCollection<TSettings>
): EditorPresetCollection<TSettings> {
  return {
    defaultPresetId: collection.defaultPresetId,
    presets: collection.presets.map(cloneEditorPreset),
  };
}

export function cloneEditorPaletteSettings(settings: EditorPaletteSettings): EditorPaletteSettings {
  return {
    shapeStroke: [...settings.shapeStroke],
    shapeFill: [...settings.shapeFill],
    textColor: [...settings.textColor],
    textBackground: [...settings.textBackground],
    sceneBackground: [...settings.sceneBackground],
  };
}

export function createDefaultEditorPresetStorageState(): EditorPresetStorageState {
  const toolSettings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET);
  const sceneBackground = createDefaultSceneBackgroundSettings();

  return {
    pencil: createDefaultCollection<'pencil'>(toolSettings.pencil),
    highlighter: createDefaultCollection<'highlighter'>(toolSettings.highlighter),
    ellipse: createDefaultCollection<'ellipse'>(toolSettings.ellipse),
    blur: createDefaultCollection<'blur'>(toolSettings.blur),
    arrow: createDefaultCollection<'arrow'>(toolSettings.arrow),
    line: createDefaultCollection<'line'>(toolSettings.line),
    text: createDefaultCollection<'text'>(toolSettings.text),
    step: createDefaultCollection<'step'>(toolSettings.step),
    sceneBackground: createDefaultCollection<'sceneBackground'>(sceneBackground),
    palette: cloneEditorPaletteSettings(DEFAULT_EDITOR_PALETTE_SETTINGS),
  };
}

export function cloneEditorPresetStorageState(
  settings: EditorPresetStorageState
): EditorPresetStorageState {
  return {
    pencil: cloneEditorPresetCollection(settings.pencil),
    highlighter: cloneEditorPresetCollection(settings.highlighter),
    ellipse: cloneEditorPresetCollection(settings.ellipse),
    blur: cloneEditorPresetCollection(settings.blur),
    arrow: cloneEditorPresetCollection(settings.arrow),
    line: cloneEditorPresetCollection(settings.line),
    text: cloneEditorPresetCollection(settings.text),
    step: cloneEditorPresetCollection(settings.step),
    sceneBackground: cloneEditorPresetCollection(settings.sceneBackground),
    palette: cloneEditorPaletteSettings(settings.palette),
  };
}
