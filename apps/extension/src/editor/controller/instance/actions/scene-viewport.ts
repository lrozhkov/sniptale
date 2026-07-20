import type { EditorControllerInstance } from '../types';
import {
  navigateEditorViewportTo,
  setEditorZoom,
  setEditorZoomAtViewportPoint,
  setEditorZoomCentered,
  zoomEditorToFit,
} from '../../viewport/actions';
import { createViewportPresentationContext } from './viewport-context';

export function zoomToFitForController(controller: EditorControllerInstance): void {
  controller.zoomLevel = zoomEditorToFit(createViewportPresentationContext(controller));
}

export function zoomInForController(controller: EditorControllerInstance): void {
  setZoomForController(controller, controller.zoomLevel * 1.15);
}

export function zoomOutForController(controller: EditorControllerInstance): void {
  setZoomForController(controller, controller.zoomLevel / 1.15);
}

export function resetZoomForController(controller: EditorControllerInstance): void {
  setZoomForController(controller, 1);
}

export function setZoomForController(controller: EditorControllerInstance, value: number): void {
  controller.zoomLevel = setEditorZoom(createViewportPresentationContext(controller), value);
}

export function setZoomCenteredForController(
  controller: EditorControllerInstance,
  value: number
): void {
  controller.zoomLevel = setEditorZoomCentered(
    createViewportPresentationContext(controller),
    value
  );
}

export function setZoomAtViewportPointForController(
  controller: EditorControllerInstance,
  value: number,
  point: { clientX: number; clientY: number }
): void {
  controller.zoomLevel = setEditorZoomAtViewportPoint(
    createViewportPresentationContext(controller),
    value,
    point
  );
}

export function navigateViewportForController(
  controller: EditorControllerInstance,
  relativeX: number,
  relativeY: number
): void {
  navigateEditorViewportTo({
    viewportElement: controller.viewportElement,
    stageElement: controller.stageElement,
    canvasDocumentSize: controller.canvasDocumentSize,
    zoomLevel: controller.zoomLevel,
    devicePixelRatioBaseline: controller.viewportDevicePixelRatioBaseline,
    relativeX,
    relativeY,
    syncViewportState: () => controller.syncViewportState(),
  });
}
