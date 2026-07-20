import type { Canvas } from 'fabric';
import { isEditableObject } from '../../../document/model';

type LayerReorderObject = ReturnType<Canvas['getObjects']>[number];
export type LayerReorderObjects = ReturnType<Canvas['getObjects']>;

export function getEditableLayerSelection(canvas: Canvas) {
  const objects = canvas.getObjects();

  return canvas
    .getActiveObjects()
    .filter(isEditableObject)
    .slice()
    .sort((left, right) => objects.indexOf(left) - objects.indexOf(right));
}

export function hasLockedObject(objects: LayerReorderObjects) {
  return objects.some((object) => object.sniptaleLocked);
}

export function createSelectedLayerIds(objects: LayerReorderObjects): Set<string> {
  return new Set(objects.map((object) => object.sniptaleId).filter(isLayerId));
}

export function getSelectedLayerIndices(
  objects: LayerReorderObjects,
  selectedIds: Set<string>
): number[] {
  return objects
    .map((object, index) => ({ object, index }))
    .filter(({ object }) => isSelectedLayerObject(selectedIds, object))
    .map(({ index }) => index);
}

export function isSelectedLayerObject(
  selectedIds: Set<string>,
  object: LayerReorderObject
): boolean {
  return object.sniptaleId !== undefined && selectedIds.has(object.sniptaleId);
}

function isLayerId(value: string | undefined): value is string {
  return value !== undefined;
}
