import { Point, util } from 'fabric';

import type { RichShapeCalloutGroup } from './types';

export function clampCalloutControlValue(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}

export function toCalloutViewportPoint(
  object: RichShapeCalloutGroup,
  point: { x: number; y: number }
): Point {
  const width = Number(object.width ?? object.sniptaleRichShape.frame.width);
  const height = Number(object.height ?? object.sniptaleRichShape.frame.height);
  return new Point(point.x - width / 2, point.y - height / 2).transform(
    util.multiplyTransformMatrices(object.getViewportTransform(), object.calcTransformMatrix())
  );
}

export function toCalloutShapePoint(
  object: RichShapeCalloutGroup,
  x: number,
  y: number
): { x: number; y: number } {
  const width = Number(object.width ?? object.sniptaleRichShape.frame.width);
  const height = Number(object.height ?? object.sniptaleRichShape.frame.height);
  const localPoint = util.sendPointToPlane(new Point(x, y), undefined, object.calcOwnMatrix());
  return {
    x: clampCalloutControlValue(localPoint.x + width / 2, 0, width),
    y: clampCalloutControlValue(localPoint.y + height / 2, 0, height),
  };
}
