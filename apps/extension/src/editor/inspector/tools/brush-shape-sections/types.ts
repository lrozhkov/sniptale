import type { EditorShapeSettings, EditorTool } from '../../../../features/editor/document/types';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import type { EditorInspectorPresetHeaderState } from '../../presets';
import type { EditorInspectorToolsPanelProps } from '../types';

export type BrushSettings = EditorToolSettings['pencil'];
export type ShapeTool = Extract<EditorTool, 'rectangle' | 'ellipse' | 'diamond'>;
export type ShapeSettings = EditorShapeSettings;

export type BrushControlsProps = Pick<
  EditorInspectorToolsPanelProps,
  | 'applyBrushPatch'
  | 'commitPendingSelectionSettings'
  | 'inspectorToolSettings'
  | 'previewColor'
  | 'previewBrushPatch'
  | 'recentColors'
  | 'shapeStrokePalette'
  | 'toNumber'
  | 'toolPresetHeader'
  | 'updateColor'
>;

export type ShapeControlsProps = Pick<
  EditorInspectorToolsPanelProps,
  | 'applyPreset'
  | 'applyShapePatch'
  | 'borderPresetOptions'
  | 'commitPendingSelectionSettings'
  | 'inspectorToolSettings'
  | 'previewColor'
  | 'previewShapePatch'
  | 'recentColors'
  | 'saveShapeAsHighlighterPreset'
  | 'shapeFillPalette'
  | 'shapeStrokePalette'
  | 'toNumber'
  | 'updateColor'
> & {
  shapeTool: ShapeTool;
  presetHeader?: EditorInspectorPresetHeaderState | null;
};
