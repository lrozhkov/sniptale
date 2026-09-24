import type { Canvas } from 'fabric';
import { resolveEditorViewportScaleCompensation } from './scale';
import { getEditorEditingSurfaceSize } from './editing-surface';
import { EditorCanvas } from './render-region';

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
  if (canvas instanceof EditorCanvas && canvas.hasVirtualViewport) {
    canvas.setPresentationScale(zoomLevel * domScaleCompensation);
    return;
  }
  const surfaceSize = getEditorEditingSurfaceSize(canvasDocumentSize);
  canvas.setDimensions(
    {
      width: Math.max(1, Math.round(surfaceSize.width * zoomLevel * domScaleCompensation)),
      height: Math.max(1, Math.round(surfaceSize.height * zoomLevel * domScaleCompensation)),
    },
    { cssOnly: true }
  );
  canvas.calcOffset();
}
