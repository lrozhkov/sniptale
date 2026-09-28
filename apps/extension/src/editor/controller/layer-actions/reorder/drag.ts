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
