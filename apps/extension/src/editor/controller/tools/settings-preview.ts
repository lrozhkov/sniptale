import type { Canvas } from 'fabric';
import type { EditorTool } from '../../../features/editor/document/types';
import type { DrawSession } from '../core/types';

/**
 * Shared drawing controls mutate the active draft directly. Retained editor tools commit their
 * previews through their own owners, so this compatibility hook only schedules presentation.
 */
export function refreshEditorToolSettingsPreview(options: {
  activeTool: EditorTool;
  canvas: Canvas | null;
  drawSession: DrawSession | null;
}): void {
  void options.activeTool;
  void options.drawSession;
  options.canvas?.requestRenderAll();
}
