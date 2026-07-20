import { resolveRectangleDimension, resolveRectangleScale } from './math';
import type { RectangleLike, RectangleVisualState } from './types';

export function captureRectangleVisualState(object: RectangleLike): RectangleVisualState {
  const width = resolveRectangleDimension(object.width);
  const height = resolveRectangleDimension(object.height);
  const strokeWidth = resolveRectangleDimension(object.strokeWidth);
  const scaleX = resolveRectangleScale(object.scaleX);
  const scaleY = resolveRectangleScale(object.scaleY);
  const center =
    typeof object.getCenterPoint === 'function'
      ? object.getCenterPoint()
      : {
          x: (typeof object.left === 'number' ? object.left : 0) + (width * scaleX) / 2,
          y: (typeof object.top === 'number' ? object.top : 0) + (height * scaleY) / 2,
        };

  return {
    center,
    outerHeight: height * scaleY + strokeWidth,
    outerWidth: width * scaleX + strokeWidth,
  };
}
