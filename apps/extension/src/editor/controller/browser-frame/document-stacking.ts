import type { Canvas } from 'fabric';
import { findBrowserFrameHeader } from '../tools/decorations';

export function ensureEditorBrowserFrameOnTop(canvas: Canvas | null): void {
  if (!canvas) {
    return;
  }

  const header = findBrowserFrameHeader(canvas);
  if (!header) {
    return;
  }

  canvas.bringObjectToFront(header);
  header.setCoords();
}
