import type { EditorObjectType, EditorShapeSettings, EditorTool } from './types';
import type { EditorToolSettings } from './tool-settings-types';

export type EditorShapeTool = Extract<EditorTool, 'rectangle' | 'ellipse' | 'diamond'>;
export type EditorShapeObjectType = Extract<EditorObjectType, 'rectangle' | 'ellipse' | 'diamond'>;
export type EditorShapeSettingsOwner = Extract<EditorShapeTool, 'rectangle' | 'ellipse'>;

export function resolveEditorShapeSettingsOwner(
  tool: EditorShapeTool | EditorShapeObjectType
): EditorShapeSettingsOwner {
  return tool === 'ellipse' ? 'ellipse' : 'rectangle';
}

export function getEditorShapeSettings(
  settings: EditorToolSettings,
  tool: EditorShapeTool | EditorShapeObjectType
): EditorShapeSettings {
  return settings[resolveEditorShapeSettingsOwner(tool)];
}
