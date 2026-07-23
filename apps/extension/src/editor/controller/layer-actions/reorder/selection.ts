import type { Canvas } from 'fabric';
import { isEditableObject, isSourceObject } from '../../../document/model';

type LayerReorderObject = ReturnType<Canvas['getObjects']>[number];
type LayerReorderObjects = ReturnType<Canvas['getObjects']>;

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

  applyLayerOrder(canvas, nextOrder);
  return true;
}

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

  applyLayerOrder(canvas, nextOrder);
  return true;
}

function getEditableLayerSelection(canvas: Canvas) {
  const objects = canvas.getObjects();

  return canvas
    .getActiveObjects()
    .filter(isEditableObject)
    .slice()
    .sort((left, right) => objects.indexOf(left) - objects.indexOf(right));
}

function hasLockedObject(objects: LayerReorderObjects) {
  return objects.some((object) => object.sniptaleLocked);
}

function createSelectedLayerIds(objects: LayerReorderObjects): Set<string> {
  return new Set(objects.map((object) => object.sniptaleId).filter(isLayerId));
}

function getSelectedLayerIndices(objects: LayerReorderObjects, selectedIds: Set<string>): number[] {
  return objects
    .map((object, index) => ({ object, index }))
    .filter(({ object }) => isSelectedLayerObject(selectedIds, object))
    .map(({ index }) => index);
}

function isSelectedLayerObject(selectedIds: Set<string>, object: LayerReorderObject): boolean {
  return object.sniptaleId !== undefined && selectedIds.has(object.sniptaleId);
}

function isLayerId(value: string | undefined): value is string {
  return value !== undefined;
}

function applyLayerOrder(canvas: Canvas, objects: LayerReorderObjects): void {
  objects.forEach((object, index) => {
    canvas.moveObjectTo(object, index);
  });
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
