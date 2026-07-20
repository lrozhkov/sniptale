import { detachEditorControllerEventHandlers } from '../../../events';
import {
  clearEditorRasterSelection,
  clearEditorRasterTransientState,
} from '../../../raster-tools/session';
import type { EditorControllerInstance } from '../../types';
import { ensureEditorCanvasReadyHandoff } from '../../../../document/canvas-ready/handoff';

export function disposeEditorController(controller: EditorControllerInstance): void {
  ensureEditorCanvasReadyHandoff(controller).tearDown();

  if (!controller.canvas) {
    return;
  }

  detachEditorControllerEventHandlers({
    canvas: controller.canvas,
    viewportElement: controller.viewportElement,
    handlers: controller.eventHandlers,
    viewportResizeObserver: controller.viewportResizeObserver,
  });
  controller.magnetManager?.dispose();
  controller.magnetManager = null;
  controller.viewportResizeObserver = null;
  if (controller.viewportSyncFrame !== 0) {
    cancelAnimationFrame(controller.viewportSyncFrame);
    controller.viewportSyncFrame = 0;
  }

  void controller.canvas.dispose();
  controller.canvas = null;
  controller.viewportElement = null;
  controller.stageElement = null;
  controller.drawSession = null;
  controller.cropGuide = null;
  controller.panSession = null;
  controller.isSpacePressed = false;
  controller.selectionNudgeSession = null;
  clearEditorRasterTransientState(controller.rasterToolSession);
  clearEditorRasterSelection(controller.rasterToolSession);
}
