import type { EditorTool } from '../../../../../features/editor/document/types';
import type { EditorControllerInstance } from '../../types';

function discardActiveCanvasSelection(controller: EditorControllerInstance): boolean {
  const activeObjects =
    controller.canvas && 'getActiveObjects' in controller.canvas
      ? controller.canvas.getActiveObjects()
      : [];
  if (activeObjects.length === 0) {
    return false;
  }

  controller.canvas?.discardActiveObject();
  controller.canvas?.requestRenderAll();
  controller.syncRuntimeState();
  return true;
}

export function clearSelectionForController(controller: EditorControllerInstance): void {
  discardActiveCanvasSelection(controller);
}

export function setActiveToolForController(
  controller: EditorControllerInstance,
  tool: EditorTool
): void {
  controller.toolModeEnabled = true;
  controller.activeTool = tool;
  controller.syncRuntimeState();
}

export function suspendToolModeForController(controller: EditorControllerInstance): void {
  controller.activeTool = 'select';
  controller.toolModeEnabled = false;
  if (!discardActiveCanvasSelection(controller)) {
    controller.syncRuntimeState();
  }
  controller.applyToolMode();
}
