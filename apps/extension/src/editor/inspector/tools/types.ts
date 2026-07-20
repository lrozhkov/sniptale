import type { EditorInspectorConfigurableToolPanelProps } from '../panel-types';
import type {
  EditorInspectorNumberParser,
  EditorInspectorPaletteState,
  EditorInspectorPresetHeaderBag,
  EditorInspectorRecentColorState,
  EditorInspectorSelectionActionIcons,
  EditorInspectorShapePresetActions,
} from '../types';

export interface EditorInspectorToolsPanelProps
  extends
    EditorInspectorConfigurableToolPanelProps,
    EditorInspectorShapePresetActions,
    EditorInspectorRecentColorState,
    EditorInspectorPaletteState,
    Pick<EditorInspectorPresetHeaderBag, 'toolPresetHeader'>,
    EditorInspectorNumberParser,
    EditorInspectorSelectionActionIcons {}
