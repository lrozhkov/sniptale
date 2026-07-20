import type { FabricObject } from 'fabric';
import { getEditorViewportMetrics } from '../../viewport';
import type { CanvasSize } from './types';

function getDevicePixelRatioBaselineOptions(devicePixelRatioBaseline?: number) {
  return devicePixelRatioBaseline === undefined ? {} : { devicePixelRatioBaseline };
}

export function focusEditorObjectInViewport({
  object,
  viewportElement,
  stageElement,
  canvasDocumentSize,
  zoomLevel,
  devicePixelRatioBaseline,
  onSynced,
}: {
  object: FabricObject;
  viewportElement: HTMLElement | null;
  stageElement: HTMLElement | null;
  canvasDocumentSize: CanvasSize;
  zoomLevel: number;
  devicePixelRatioBaseline?: number;
  onSynced: () => void;
}): void {
  if (!viewportElement) {
    return;
  }

  const bounds = object.getBoundingRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;

  requestAnimationFrame(() => {
    const metrics = getEditorViewportMetrics({
      viewportElement,
      stageElement,
      canvasDocumentSize,
      zoomLevel,
      ...getDevicePixelRatioBaselineOptions(devicePixelRatioBaseline),
    });
    viewportElement.scrollLeft =
      Math.max(0, centerX * zoomLevel + metrics.canvasOffsetLeft - metrics.viewportWidth / 2) *
      metrics.domScaleCompensation;
    viewportElement.scrollTop =
      Math.max(0, centerY * zoomLevel + metrics.canvasOffsetTop - metrics.viewportHeight / 2) *
      metrics.domScaleCompensation;
    onSynced();
  });
}
