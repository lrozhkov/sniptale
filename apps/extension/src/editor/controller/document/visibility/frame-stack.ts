import type { Canvas } from 'fabric';
import { isFrameObject } from '../../../document/model';

export function sendEditorFrameObjectsToBack(
  canvas: Canvas | null,
  ensureBrowserFrameOnTop: () => void
): void {
  if (!canvas) {
    return;
  }

  canvas
    .getObjects()
    .filter(isFrameObject)
    .forEach((object) => {
      canvas.sendObjectToBack(object);
    });
  ensureBrowserFrameOnTop();
}
