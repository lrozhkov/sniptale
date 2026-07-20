import type { EditorPreset } from '../../../features/editor/document/presets';
import type { BorderPreset } from '../../../features/highlighter/contracts';
import type { useEditorSection } from './controller';
import type { EditorSettingsPresetOwner } from './families';

export type EditorSectionState = ReturnType<typeof useEditorSection>;
export type EditorSettingsManagedOwner = Exclude<EditorSettingsPresetOwner, 'rectangle'>;
export type EditorManagedPreset = {
  [TOwner in EditorSettingsManagedOwner]: EditorPreset<
    EditorSectionState['editorPresetState'][TOwner]['presets'][number]['settings']
  >;
}[EditorSettingsManagedOwner];
export type RectanglePreset = BorderPreset;
