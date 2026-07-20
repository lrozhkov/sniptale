import type { EditorControllerInstance } from '../types';

export function createViewportPresentationContext(controller: EditorControllerInstance) {
  return {
    canvas: controller.canvas,
    viewportElement: controller.viewportElement,
    stageElement: controller.stageElement,
    canvasDocumentSize: controller.canvasDocumentSize,
    zoomLevel: controller.zoomLevel,
    devicePixelRatioBaseline: controller.viewportDevicePixelRatioBaseline,
    syncViewportState: () => controller.syncViewportState(),
    syncRuntimeState: () => controller.syncRuntimeState(),
  };
}
