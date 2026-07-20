import type { FabricObject } from 'fabric';
import { isBlurObject } from './identity';

export function normalizeScaledBlurTarget(object: FabricObject): boolean {
  if (!isBlurObject(object)) {
    return false;
  }

  const scaleX = typeof object.scaleX === 'number' ? object.scaleX : 1;
  const scaleY = typeof object.scaleY === 'number' ? object.scaleY : 1;
  if (scaleX === 1 && scaleY === 1) {
    return false;
  }

  const bounds = object.getBoundingRect();
  object.set({
    height: Math.max(1, Math.round(bounds.height)),
    left: bounds.left,
    scaleX: 1,
    scaleY: 1,
    top: bounds.top,
    width: Math.max(1, Math.round(bounds.width)),
  });
  object.setCoords();
  return true;
}
