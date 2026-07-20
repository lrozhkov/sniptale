import { Point } from 'fabric';
import { resolveRectangleDimension, resolveRectangleScale } from './math';
import type { RectangleLike, RectangleVisualState } from './types';

export function restoreRectangleCenter(
  rect: RectangleLike,
  center: RectangleVisualState['center']
): void {
  if (typeof rect.setPositionByOrigin === 'function') {
    rect.setPositionByOrigin(new Point(center.x, center.y), 'center', 'center');
    return;
  }

  const width = resolveRectangleDimension(rect.width) * resolveRectangleScale(rect.scaleX);
  const height = resolveRectangleDimension(rect.height) * resolveRectangleScale(rect.scaleY);
  rect.set({
    left: center.x - width / 2,
    top: center.y - height / 2,
  });
}
