import type { EditorPresetFamily, EditorPresetSettingsMap } from '../document/presets';

export function sanitizeEditorComparableSettings<TKey extends EditorPresetFamily>(
  _family: TKey,
  settings: EditorPresetSettingsMap[TKey]
): EditorPresetSettingsMap[TKey] {
  return structuredClone(settings);
}

export function sanitizeEditorPresetSettings<TKey extends EditorPresetFamily>(
  _family: TKey,
  settings: EditorPresetSettingsMap[TKey]
): EditorPresetSettingsMap[TKey] {
  return structuredClone(settings);
}
