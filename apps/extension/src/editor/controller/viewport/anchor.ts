import type { Canvas } from 'fabric';
import { getEditorViewportMetrics } from './metrics';
import type { ViewportAnchor } from '../core/types';
import { EditorCanvas } from '../../document/canvas-surface/render-region';

export function captureEditorViewportAnchor(options: {
  canvas: Canvas | null;
  viewportElement: HTMLElement | null;
  stageElement: HTMLElement | null;
  canvasDocumentSize: { width: number; height: number };
  zoomLevel: number;
  devicePixelRatioBaseline?: number;
}): ViewportAnchor | null {
  if (!options.canvas || !options.viewportElement) {
    return null;
  }

  const metrics = getEditorViewportMetrics(options);
  if (metrics.scaledCanvasWidth <= 0 || metrics.scaledCanvasHeight <= 0) {
    return null;
  }

  return {
    relativeX:
      (metrics.scrollLeft + metrics.viewportWidth / 2 - metrics.canvasOffsetLeft) /
      metrics.scaledCanvasWidth,
    relativeY:
      (metrics.scrollTop + metrics.viewportHeight / 2 - metrics.canvasOffsetTop) /
      metrics.scaledCanvasHeight,
  };
}

export function restoreEditorViewportAnchor(options: {
  canvas: Canvas | null;
  viewportElement: HTMLElement | null;
  stageElement: HTMLElement | null;
  canvasDocumentSize: { width: number; height: number };
  zoomLevel: number;
  anchor: ViewportAnchor | null;
  onSynced: () => void;
  devicePixelRatioBaseline?: number;
}): void {
  if (!options.canvas || !options.viewportElement || !options.anchor) {
    return;
  }
  const anchor = options.anchor;

  const restore = () => {
    if (!options.canvas || !options.viewportElement) {
      return;
    }

    const metrics = getEditorViewportMetrics(options);
    options.viewportElement.scrollLeft =
      Math.max(
        0,
        anchor.relativeX * metrics.scaledCanvasWidth +
          metrics.canvasOffsetLeft -
          metrics.viewportWidth / 2
      ) * metrics.domScaleCompensation;
    options.viewportElement.scrollTop =
      Math.max(
        0,
        anchor.relativeY * metrics.scaledCanvasHeight +
          metrics.canvasOffsetTop -
          metrics.viewportHeight / 2
      ) * metrics.domScaleCompensation;
    if (options.canvas instanceof EditorCanvas && options.canvas.hasVirtualViewport) {
      options.canvas.refreshVirtualViewport();
    }
    options.onSynced();
  };
  if (options.canvas instanceof EditorCanvas && options.canvas.hasVirtualViewport) restore();
  else requestAnimationFrame(restore);
}
