import type { Canvas } from 'fabric';
import { resolveEditorViewportScaleCompensation } from './scale';

export function applyEditorViewportZoom(
  canvas: Canvas | null,
  canvasDocumentSize: { width: number; height: number },
  zoomLevel: number,
  devicePixelRatioBaseline?: number
): void {
  if (!canvas) {
    return;
  }

  const domScaleCompensation = resolveEditorViewportScaleCompensation(devicePixelRatioBaseline);
  canvas.setDimensions(
    {
      width: Math.max(1, Math.round(canvasDocumentSize.width * zoomLevel * domScaleCompensation)),
      height: Math.max(1, Math.round(canvasDocumentSize.height * zoomLevel * domScaleCompensation)),
    },
    { cssOnly: true }
  );
  canvas.calcOffset();
}
