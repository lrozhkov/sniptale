import type { Canvas, FabricObject } from 'fabric';

import { resizeTextCallout } from '../../../objects/annotation/text/callout/resize';
import { normalizeScaledRectangleTarget } from '../../../objects/shape-style';
import { isTextbox } from '../../core/helpers';
import { findObjectById } from '../../document/layers';
import { normalizeScaledAnnotationTarget } from '../../tools/annotation-resize';
import { isEditableObject } from '../../../document/model';

export function resizeLayerObject(
  canvas: Canvas | null,
  id: string,
  width: number,
  height: number,
  ensureObjectReachable: (object: FabricObject) => boolean
): FabricObject | null {
  const object = findObjectById(canvas, id);
  if (!object || !isEditableObject(object) || object.sniptaleLocked) {
    return null;
  }

  const currentWidth = object.getScaledWidth();
  const currentHeight = object.getScaledHeight();
  if (currentWidth <= 0 || currentHeight <= 0) {
    return null;
  }

  const nextWidth = Math.max(1, Math.round(width));
  const nextHeight = Math.max(1, Math.round(height));
  if (
    isTextbox(object) &&
    (object.sniptaleType === 'text' || object.sniptaleType === 'meta-stamp')
  ) {
    resizeTextCallout(object, nextWidth, nextHeight);
    object.setCoords();
    ensureObjectReachable(object);
    canvas?.requestRenderAll();
    return object;
  }

  object.set({
    scaleX: (object.scaleX ?? 1) * (nextWidth / currentWidth),
    scaleY: (object.scaleY ?? 1) * (nextHeight / currentHeight),
  });
  if (!normalizeScaledRectangleTarget(object)) {
    normalizeScaledAnnotationTarget(object);
  }
  object.setCoords();
  ensureObjectReachable(object);
  canvas?.requestRenderAll();
  return object;
}
