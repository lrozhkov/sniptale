import type { Canvas } from 'fabric';
import { getLayerObjects } from '../../document/layers';
import { isSourceObject } from '../../../document/model';

export function reorderLayerObjects(
  canvas: Canvas | null,
  draggedId: string,
  targetId: string
): boolean {
  if (!canvas || draggedId === targetId) {
    return false;
  }

  const layers = getLayerObjects(canvas).slice().reverse();
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
  if (dragged.sniptaleLocked || isSourceObject(dragged)) {
    return false;
  }
  const target = layers[targetIndex];
  if (!target || isSourceObject(target)) {
    return false;
  }
  next.splice(targetIndex, 0, dragged);

  next
    .slice()
    .reverse()
    .forEach((object, index) => {
      canvas.moveObjectTo(object, index);
    });

  return true;
}
