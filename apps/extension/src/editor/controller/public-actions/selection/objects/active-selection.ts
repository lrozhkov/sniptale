import type { Canvas, FabricObject } from 'fabric';

import { isEditableObject } from '../../../../document/model';

export function getMutableEditorSelection(canvas: Canvas | null): FabricObject[] | null {
  if (!canvas) {
    return null;
  }

  const activeObjects = canvas.getActiveObjects().filter(isEditableObject);
  if (activeObjects.length === 0 || activeObjects.some((object) => object.sniptaleLocked)) {
    return null;
  }

  return activeObjects;
}
