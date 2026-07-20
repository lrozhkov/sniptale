import type { Canvas } from 'fabric';
import { isSourceObject } from '../../../document/model';
import {
  createSelectedLayerIds,
  getEditableLayerSelection,
  hasLockedObject,
  isSelectedLayerObject,
} from './selection-state';

export function moveLayerSelectionToEdge(canvas: Canvas | null, edge: 'front' | 'back'): boolean {
  if (!canvas) {
    return false;
  }

  const objects = canvas.getObjects();
  const activeObjects = getEditableLayerSelection(canvas);
  if (
    activeObjects.length === 0 ||
    activeObjects.length === objects.length ||
    hasLockedObject(activeObjects)
  ) {
    return false;
  }

  const selectedIds = createSelectedLayerIds(activeObjects);
  const remainingObjects = objects.filter((object) => !isSelectedLayerObject(selectedIds, object));
  const nextOrder =
    edge === 'front'
      ? [...remainingObjects, ...activeObjects]
      : [
          ...remainingObjects.filter(isSourceObject),
          ...activeObjects,
          ...remainingObjects.filter((object) => !isSourceObject(object)),
        ];

  nextOrder.forEach((object, index) => {
    canvas.moveObjectTo(object, index);
  });

  return true;
}
