import type { Canvas } from 'fabric';
import { isEditableObject, isSourceObject } from '../../../document/model';
import {
  createSelectedLayerIds,
  getSelectedLayerIndices,
  hasLockedObject,
  isSelectedLayerObject,
  type LayerReorderObjects,
} from './selection-state';

export function moveLayerSelection(canvas: Canvas | null, direction: 1 | -1): boolean {
  if (!canvas) {
    return false;
  }

  const objects = canvas.getObjects();
  const activeObjects = canvas.getActiveObjects().filter(isEditableObject);
  if (activeObjects.length === 0 || hasLockedObject(activeObjects)) {
    return false;
  }

  const selectedIds = createSelectedLayerIds(activeObjects);
  const orderedIndices = getSelectedLayerIndices(objects, selectedIds);

  if (orderedIndices.length === 0) {
    return false;
  }

  const nextOrder = [...objects];
  if (direction > 0) {
    moveSelectionForward(nextOrder, selectedIds);
  } else {
    moveSelectionBackward(nextOrder, selectedIds);
  }

  nextOrder.forEach((object, index) => {
    canvas.moveObjectTo(object, index);
  });

  return true;
}

function moveSelectionForward(objects: LayerReorderObjects, selectedIds: Set<string>) {
  for (let index = objects.length - 2; index >= 0; index -= 1) {
    const current = objects[index];
    const next = objects[index + 1];
    if (
      current &&
      next &&
      isSelectedLayerObject(selectedIds, current) &&
      !isSelectedLayerObject(selectedIds, next)
    ) {
      objects[index] = next;
      objects[index + 1] = current;
    }
  }
}

function moveSelectionBackward(objects: LayerReorderObjects, selectedIds: Set<string>) {
  for (let index = 1; index < objects.length; index += 1) {
    const previous = objects[index - 1];
    const current = objects[index];
    if (!previous || !current || isSourceObject(previous)) {
      continue;
    }
    if (
      isSelectedLayerObject(selectedIds, current) &&
      !isSelectedLayerObject(selectedIds, previous)
    ) {
      objects[index - 1] = current;
      objects[index] = previous;
    }
  }
}
