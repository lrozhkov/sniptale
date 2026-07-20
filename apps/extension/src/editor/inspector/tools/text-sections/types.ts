import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import type { EditorInspectorToolsPanelProps } from '../types';

export type TextSettings = EditorToolSettings['text'];
export type TextControlsProps = Pick<
  EditorInspectorToolsPanelProps,
  | 'applyTextPatch'
  | 'applyTextStyle'
  | 'commitPendingSelectionSettings'
  | 'fontOptions'
  | 'inspectorToolSettings'
  | 'previewColor'
  | 'previewTextPatch'
  | 'recentColors'
  | 'textAlignOptions'
  | 'textBackgroundPalette'
  | 'textColorPalette'
  | 'textVerticalAlignOptions'
  | 'toNumber'
  | 'toolPresetHeader'
  | 'updateColor'
>;
