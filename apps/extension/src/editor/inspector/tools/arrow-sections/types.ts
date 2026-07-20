import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import type { EditorInspectorToolsPanelProps } from '../types';

export type ArrowSettings = EditorToolSettings['arrow'];

export type ArrowControlsProps = Pick<
  EditorInspectorToolsPanelProps,
  | 'arrowHeadOptions'
  | 'arrowTypeOptions'
  | 'applyArrowPatch'
  | 'commitPendingSelectionSettings'
  | 'inspectorToolSettings'
  | 'lineStyleOptions'
  | 'previewColor'
  | 'previewArrowPatch'
  | 'recentColors'
  | 'shapeStrokePalette'
  | 'toNumber'
  | 'toolPresetHeader'
  | 'updateColor'
>;
