import type { FabricObject, Point } from 'fabric';
import { cancelEditorTransientInteraction } from '../../../input/canvas-actions/transient';
import {
  getEditorControllerActiveCropRect,
  startEditorControllerDrawSession,
} from '../../../input/canvas-actions/draw-session';
import type { DrawSession } from '../../../core/types';
import type { EditorControllerInstance } from '../../types';

export function cancelTransientInteractionForController(
  controller: EditorControllerInstance
): boolean {
  const nextState = cancelEditorTransientInteraction({
    canvas: controller.canvas,
    drawSession: controller.drawSession,
    cropGuide: controller.cropGuide,
    activeTool: controller.activeTool,
    clearCropSelection: () => controller.clearCropSelection(),
    switchToSelectTool: () => controller.switchToSelectTool(),
    syncRuntimeState: () => controller.syncRuntimeState(),
  });
  controller.drawSession = nextState.drawSession;
  return nextState.changed;
}

export function startDrawSessionForController(
  controller: EditorControllerInstance,
  tool: DrawSession['tool'],
  start: Point,
  object: FabricObject
): void {
  const nextState = startEditorControllerDrawSession({
    canvas: controller.canvas,
    tool,
    start,
    object,
    cropGuide: controller.cropGuide,
    prepareObject: (item) => controller.prepareObject(item),
  });
  if (!nextState) {
    return;
  }

  controller.drawSession = nextState.drawSession;
  controller.cropGuide = nextState.cropGuide;
  controller.cropSelection = nextState.cropSelection;
}

export function getActiveCropRectForController(controller: EditorControllerInstance) {
  return getEditorControllerActiveCropRect(controller.drawSession, controller.cropGuide);
}
