import { flushEditorFreehandCompletion } from '../../../draw-workflow/released';
import { cancelDeferredEditorHistory } from '../../../history';
import { unmountEditorRasterRuntime } from '../../../../raster-editing/runtime';
import { unmountEditorSimplifyRuntime } from '../../../../drawing/simplify-runtime';
import { detachEditorControllerEventHandlers } from '../../../events';
import type { EditorControllerInstance } from '../../types';
import { ensureEditorCanvasReadyHandoff } from '../../../../document/canvas-ready/handoff';
import { detachEditorCanvasPointerCapture } from './pointer-capture';
import { disposeEditorSelectionChrome } from './selection-chrome';

export function disposeEditorController(controller: EditorControllerInstance): void {
  flushEditorFreehandCompletion(controller.canvas);
  cancelDeferredEditorHistory(controller.history);
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
  unmountEditorRasterRuntime(controller.canvas);
  unmountEditorSimplifyRuntime(controller.canvas);
  disposeEditorSelectionChrome(controller.canvas);
  controller.magnetManager?.dispose();
  controller.magnetManager = null;
  controller.viewportResizeObserver = null;
  detachEditorCanvasPointerCapture(controller.canvas);
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
}
