import type { FabricObject } from 'fabric';
import { isRichShapeObject } from '../guards';
import { getNormalizedRichShapeFrame, withNormalizedRichShapeBounds } from './bounds';
import { applyRichShapeDocumentObjectToObject } from './apply';

export function normalizeScaledRichShapeObject(object: FabricObject): boolean {
  if (!isRichShapeObject(object)) {
    return false;
  }

  const scaleX = Number(object.scaleX ?? 1);
  const scaleY = Number(object.scaleY ?? 1);
  if (scaleX === 1 && scaleY === 1) {
    return false;
  }

  return applyRichShapeDocumentObjectToObject(
    object,
    withNormalizedRichShapeBounds(object, getNormalizedRichShapeFrame(object))
  );
}

export function resizeRichShapeObjectToBounds(
  object: FabricObject,
  bounds: { left: number; top: number; width: number; height: number }
): boolean {
  if (!isRichShapeObject(object)) {
    return false;
  }

  return applyRichShapeDocumentObjectToObject(
    object,
    withNormalizedRichShapeBounds(object, bounds)
  );
}
