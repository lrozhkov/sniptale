import type { Canvas } from 'fabric';

export function renderClosedEditorCanvas(canvas: Canvas): void {
  canvas.requestRenderAll();
}
