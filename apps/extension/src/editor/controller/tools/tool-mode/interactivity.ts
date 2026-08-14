import type { Canvas } from 'fabric';

import { isEditableObject } from '../../../document/model';
type CanvasInteractivityMode = 'all' | 'selection' | 'text' | 'none';

export function setCanvasObjectInteractivity(canvas: Canvas, mode: CanvasInteractivityMode): void {
  const activeObjects = canvas.getActiveObjects();
  const activeObjectIds = new Set(
    activeObjects
      .map((object) => object.sniptaleId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  canvas.getObjects().forEach((object) => {
    if (!isEditableObject(object)) {
      return;
    }

    const selectableBase = object.sniptaleLocked !== true;
    const isSelected =
      activeObjects.some((activeObject) => activeObject === object) ||
      (typeof object.sniptaleId === 'string' && activeObjectIds.has(object.sniptaleId));

    const interactive =
      mode === 'all'
        ? selectableBase
        : mode === 'text'
          ? selectableBase && object.sniptaleType === 'text'
          : mode === 'selection'
            ? selectableBase && isSelected
            : false;

    object.set({
      evented: interactive,
      selectable: interactive,
    });
  });
}
