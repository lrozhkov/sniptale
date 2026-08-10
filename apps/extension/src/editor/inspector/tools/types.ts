import type { EditorInspectorConfigurableToolPanelProps } from '../panel-types';
import type {
  EditorInspectorNumberParser,
  EditorInspectorPaletteState,
  EditorInspectorPresetHeaderBag,
  EditorInspectorRecentColorState,
  EditorInspectorSelectionActionIcons,
} from '../types';

export interface EditorInspectorToolsPanelProps
  extends
    EditorInspectorConfigurableToolPanelProps,
    EditorInspectorRecentColorState,
    EditorInspectorPaletteState,
    Pick<EditorInspectorPresetHeaderBag, 'toolPresetHeader'>,
    EditorInspectorNumberParser,
    EditorInspectorSelectionActionIcons {}
