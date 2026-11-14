import type { Canvas } from 'fabric';
import { getLayerObjects } from '../../document/layers';
import { isBackgroundObject, isBrowserFrameObject, isSourceObject } from '../../../document/model';

export function reorderLayerObjects(
  canvas: Canvas | null,
  draggedId: string,
  targetId: string
): boolean {
  if (!canvas || draggedId === targetId) {
    return false;
  }

  const layers = getLayerObjects(canvas).slice().reverse();
  const hasBrowserWindow = canvas.getObjects().some(isBrowserFrameObject);
  const draggedIndex = layers.findIndex((object) => object.sniptaleId === draggedId);
  const targetIndex = layers.findIndex((object) => object.sniptaleId === targetId);
  if (draggedIndex === -1 || targetIndex === -1) {
    return false;
  }

  const next = [...layers];
  const [dragged] = next.splice(draggedIndex, 1);
  if (!dragged) {
    return false;
  }
  if (
    (dragged.sniptaleLocked || isSourceObject(dragged)) &&
    !(hasBrowserWindow && isSourceObject(dragged))
  ) {
    return false;
  }
  const target = layers[targetIndex];
  if (
    !target ||
    (isSourceObject(target) && !hasBrowserWindow) ||
    (isSourceObject(dragged) && isBackgroundObject(target))
  ) {
    return false;
  }
  next.splice(targetIndex, 0, dragged);

  const header = canvas.getObjects().find(isBrowserFrameObject);
  const physicalOrder = next
    .slice()
    .reverse()
    .flatMap((object) => (header && isSourceObject(object) ? [object, header] : [object]));
  physicalOrder.forEach((object, index) => {
    canvas.moveObjectTo(object, index);
  });

  return true;
}

export function reorderLayerBlockObjects(
  canvas: Canvas | null,
  ids: readonly string[],
  beforeId: string | null
): boolean {
  if (!canvas || !ids.length || new Set(ids).size !== ids.length) return false;
  const layers = getLayerObjects(canvas).slice().reverse();
  const selected = new Set(ids);
  const moving = layers.filter((object) => object.sniptaleId && selected.has(object.sniptaleId));
  const hasWindow = canvas.getObjects().some(isBrowserFrameObject);
  if (
    moving.length !== ids.length ||
    moving.some(
      (object) =>
        (object.sniptaleLocked || isSourceObject(object)) && !(hasWindow && isSourceObject(object))
    )
  )
    return false;
  const rest = layers.filter((object) => !moving.includes(object));
  const index =
    beforeId === null ? rest.length : rest.findIndex((object) => object.sniptaleId === beforeId);
  if (index < 0) return false;
  const next = [...rest.slice(0, index), ...moving, ...rest.slice(index)];
  const sourceIndex = next.findIndex(isSourceObject);
  const backgroundIndex = next.findIndex(isBackgroundObject);
  if (
    (!hasWindow &&
      sourceIndex >= 0 &&
      next.slice(sourceIndex + 1).some((object) => !isBackgroundObject(object))) ||
    (sourceIndex >= 0 && backgroundIndex >= 0 && sourceIndex > backgroundIndex) ||
    next.every((object, position) => object === layers[position])
  )
    return false;
  const header = canvas.getObjects().find(isBrowserFrameObject);
  next
    .slice()
    .reverse()
    .flatMap((object) => (header && isSourceObject(object) ? [object, header] : [object]))
    .forEach((object, position) => canvas.moveObjectTo(object, position));
  return true;
}
