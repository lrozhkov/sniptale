import {
  DEFAULT_EDITOR_TOOL_SETTINGS,
  EDITOR_SCENE_BACKGROUND_PALETTE,
} from '../../../features/editor/document/constants';
import type {
  EditorPaletteSettings,
  EditorPreset,
  EditorPresetCollection,
  EditorPresetSettingsMap,
  EditorPresetStorageState,
} from '../../../features/editor/document/presets';
import { translate } from '../../../platform/i18n';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/public';
import { createDefaultSceneBackgroundSettings } from './scene-defaults';

export const EDITOR_PRESETS_STORAGE_KEY = 'sniptale_editor_presets';
const DEFAULT_EDITOR_PRESET_NAME = translate('shared.defaults.defaultEditorPresetName');
const DEFAULT_EDITOR_PRESET_ID = 'system-default';

const DEFAULT_EDITOR_PALETTE_SETTINGS: EditorPaletteSettings = {
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
    sceneBackground: [...settings.sceneBackground],
  };
}

export function createDefaultEditorPresetStorageState(): EditorPresetStorageState {
  const toolSettings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET);
  const sceneBackground = createDefaultSceneBackgroundSettings();

  return {
    step: createDefaultCollection<'step'>(toolSettings.step),
    sceneBackground: createDefaultCollection<'sceneBackground'>(sceneBackground),
    palette: cloneEditorPaletteSettings(DEFAULT_EDITOR_PALETTE_SETTINGS),
  };
}

export function cloneEditorPresetStorageState(
  settings: EditorPresetStorageState
): EditorPresetStorageState {
  return {
    step: cloneEditorPresetCollection(settings.step),
    sceneBackground: cloneEditorPresetCollection(settings.sceneBackground),
    palette: cloneEditorPaletteSettings(settings.palette),
  };
}
