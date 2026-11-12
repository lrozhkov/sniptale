import type { Canvas } from 'fabric';
import {
  isBackgroundObject,
  isBrowserFrameObject,
  isFrameObject,
  isEditableObject,
  isSourceObject,
} from '../../../document/model';

type LayerReorderObject = ReturnType<Canvas['getObjects']>[number];
type LayerReorderObjects = ReturnType<Canvas['getObjects']>;

export function moveLayerSelection(canvas: Canvas | null, direction: 1 | -1): boolean {
  if (!canvas) {
    return false;
  }

  const activeObjects = canvas.getActiveObjects().filter(isEditableObject);
  const collection = activeObjects[0]?.parent ?? canvas;
  const objects = collection.getObjects().filter((object) => !isBrowserFrameObject(object));
  const hasBrowserWindow = collection === canvas && canvas.getObjects().some(isBrowserFrameObject);
  if (
    activeObjects.length === 0 ||
    activeObjects.some((object) => (object.parent ?? canvas) !== collection) ||
    hasLockedObject(activeObjects, hasBrowserWindow)
  ) {
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
    moveSelectionBackward(nextOrder, selectedIds, hasBrowserWindow);
  }

  if (collection === canvas) applyLayerOrder(canvas, nextOrder);
  else nextOrder.forEach((object, index) => collection.moveObjectTo(object, index));
  return true;
}

export function moveLayerSelectionToEdge(canvas: Canvas | null, edge: 'front' | 'back'): boolean {
  if (!canvas) {
    return false;
  }

  const selection = canvas.getActiveObjects().filter(isEditableObject);
  const collection = selection[0]?.parent ?? canvas;
  const objects = collection.getObjects().filter((object) => !isBrowserFrameObject(object));
  const hasBrowserWindow = collection === canvas && canvas.getObjects().some(isBrowserFrameObject);
  const activeObjects = selection
    .slice()
    .sort((left, right) => objects.indexOf(left) - objects.indexOf(right));
  if (
    activeObjects.length === 0 ||
    activeObjects.length === objects.length ||
    activeObjects.some((object) => (object.parent ?? canvas) !== collection) ||
    hasLockedObject(activeObjects, hasBrowserWindow)
  ) {
    return false;
  }

  const selectedIds = createSelectedLayerIds(activeObjects);
  const remainingObjects = objects.filter((object) => !isSelectedLayerObject(selectedIds, object));
  const selectedWindow = hasBrowserWindow && activeObjects.some(isSourceObject);
  const baseObjects = selectedWindow
    ? remainingObjects.filter((object) => isFrameObject(object) || isBackgroundObject(object))
    : remainingObjects.filter(isSourceObject);
  const nextOrder =
    edge === 'front'
      ? [...remainingObjects, ...activeObjects]
      : [
          ...baseObjects,
          ...activeObjects,
          ...remainingObjects.filter((object) => !baseObjects.includes(object)),
        ];

  if (collection === canvas) applyLayerOrder(canvas, nextOrder);
  else nextOrder.forEach((object, index) => collection.moveObjectTo(object, index));
  return true;
}

function hasLockedObject(objects: LayerReorderObjects, hasBrowserWindow: boolean) {
  return objects.some((object) => {
    if (object.sniptaleLocked && !(hasBrowserWindow && isSourceObject(object))) return true;
    let parent = object.parent;
    while (parent) {
      if (parent.sniptaleLocked || parent.visible === false) return true;
      parent = parent.parent;
    }
    return false;
  });
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
  const header = canvas.getObjects().find(isBrowserFrameObject);
  const source = objects.find(isSourceObject);
  const physicalOrder =
    header && source
      ? objects.flatMap((object) => (object === source ? [object, header] : [object]))
      : objects;
  physicalOrder.forEach((object, index) => {
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

function moveSelectionBackward(
  objects: LayerReorderObjects,
  selectedIds: Set<string>,
  hasBrowserWindow: boolean
) {
  for (let index = 1; index < objects.length; index += 1) {
    const previous = objects[index - 1];
    const current = objects[index];
    if (
      !previous ||
      !current ||
      isBackgroundObject(previous) ||
      (isSourceObject(previous) && !hasBrowserWindow)
    ) {
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
