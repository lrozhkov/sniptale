import type {
  EditorPreset,
  EditorPresetFamily,
  EditorPresetSettingsMap,
} from '../../../../../features/editor/document/presets';
export type ToolPresetOwner = EditorPresetFamily;
export type ManagedToolPreset = {
  [TKey in EditorPresetFamily]: EditorPreset<EditorPresetSettingsMap[TKey]>;
}[EditorPresetFamily];
