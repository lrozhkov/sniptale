import { Point, type FabricObject } from 'fabric';
import { resolveRectangleDimension, resolveRectangleScale } from './geometry';

export type RectangleLike = FabricObject & {
  getCenterPoint?: () => { x: number; y: number };
  height?: number;
  left?: number;
  sniptaleRole?: string;
  sniptaleShapeRadius?: number;
  sniptaleType?: string;
  rx?: number;
  ry?: number;
  scaleX?: number;
  scaleY?: number;
  set: (values: Record<string, unknown>) => unknown;
  setPositionByOrigin?: (point: Point, originX: 'center', originY: 'center') => unknown;
  strokeWidth?: number;
  top?: number;
  width?: number;
};

export interface RectangleVisualState {
  center: { x: number; y: number };
  outerHeight: number;
  outerWidth: number;
}

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

export function resolveRectangleIntentRadius(rect: RectangleLike): number {
  if (typeof rect.sniptaleShapeRadius === 'number' && Number.isFinite(rect.sniptaleShapeRadius)) {
    return Math.max(0, rect.sniptaleShapeRadius);
  }

  if (typeof rect.rx === 'number' && Number.isFinite(rect.rx)) {
    return Math.max(0, rect.rx);
  }

  return typeof rect.ry === 'number' && Number.isFinite(rect.ry) ? Math.max(0, rect.ry) : 0;
}
