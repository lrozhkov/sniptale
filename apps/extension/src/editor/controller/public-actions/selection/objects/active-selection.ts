import type { Canvas, FabricObject } from 'fabric';

import { isEditableObject } from '../../../../document/model';

export function getMutableEditorSelection(canvas: Canvas | null): FabricObject[] | null {
  if (!canvas) {
    return null;
  }

  const activeObjects = canvas.getActiveObjects().filter(isEditableObject);
  const parent = activeObjects[0]?.parent ?? null;
  if (
    activeObjects.length === 0 ||
    activeObjects.some((object) => {
      if ((object.parent ?? null) !== parent) return true;
      let current: FabricObject | undefined = object;
      while (current) {
        if (current.sniptaleLocked || (current !== object && current.visible === false))
          return true;
        current = current.parent;
      }
      return false;
    })
  ) {
    return null;
  }

  return activeObjects;
}
