import type { FabricObject } from 'fabric';
import {
  clampRectangleGeometry,
  resolveRectangleDimension,
  resolveRectangleRenderRadius,
  resolveRectangleScale,
} from './geometry';
import {
  captureRectangleVisualState,
  resolveRectangleIntentRadius,
  restoreRectangleCenter,
  type RectangleLike,
} from './visual-state';

function isEditorRectangleTarget(object: FabricObject): object is RectangleLike {
  return object.sniptaleRole === 'annotation' && object.sniptaleType === 'shape';
}

export function normalizeScaledRectangleTarget(object: FabricObject): boolean {
  if (!isEditorRectangleTarget(object)) {
    return false;
  }

  const scaleX = resolveRectangleScale(object.scaleX);
  const scaleY = resolveRectangleScale(object.scaleY);
  if (scaleX === 1 && scaleY === 1) {
    return false;
  }

  const visualState = captureRectangleVisualState(object);
  const strokeWidth = resolveRectangleDimension(object.strokeWidth);
  const width = clampRectangleGeometry(visualState.outerWidth, strokeWidth, 1);
  const height = clampRectangleGeometry(visualState.outerHeight, strokeWidth, 1);
  const radius = resolveRectangleRenderRadius(resolveRectangleIntentRadius(object), width, height);

  object.set({
    height,
    rx: radius,
    ry: radius,
    scaleX: 1,
    scaleY: 1,
    strokeUniform: true,
    width,
  });
  restoreRectangleCenter(object, visualState.center);
  return true;
}
