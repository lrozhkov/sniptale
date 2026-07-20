import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import type { EditorInspectorToolsPanelProps } from '../types';

export type LineSettings = EditorToolSettings['line'];
export type LineControlsProps = Pick<
  EditorInspectorToolsPanelProps,
  | 'commitPendingSelectionSettings'
  | 'inspectorToolSettings'
  | 'lineCornerOptions'
  | 'lineFillModeOptions'
  | 'lineRoughFillStyleOptions'
  | 'lineStyleOptions'
  | 'previewColor'
  | 'recentColors'
  | 'shapeFillPalette'
  | 'shapeStrokePalette'
  | 'toNumber'
  | 'toolPresetHeader'
  | 'updateColor'
> & {
  applyLinePatch: (patch: Partial<LineSettings>) => void;
  previewLinePatch: (patch: Partial<LineSettings>) => void;
};
