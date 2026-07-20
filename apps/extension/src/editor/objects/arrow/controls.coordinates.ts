import { Point, util } from 'fabric';
import type { ArrowPathInstance } from './controls.types';
import type { PointLike } from './types';

export function toViewportPoint(arrow: ArrowPathInstance, point: PointLike): Point {
  return new Point(point.x - arrow.pathOffset.x, point.y - arrow.pathOffset.y).transform(
    util.multiplyTransformMatrices(arrow.getViewportTransform(), arrow.calcTransformMatrix())
  );
}

export function toParentPlanePoint(arrow: ArrowPathInstance, point: PointLike): Point {
  return new Point(point.x, point.y).subtract(arrow.pathOffset).transform(arrow.calcOwnMatrix());
}

export function toArrowGeometryPoint(arrow: ArrowPathInstance, point: PointLike): PointLike {
  const mouseLocalPosition = util.sendPointToPlane(
    new Point(point.x, point.y),
    undefined,
    arrow.calcOwnMatrix()
  );
  const nextPoint = mouseLocalPosition.add(arrow.pathOffset);
  return { x: nextPoint.x, y: nextPoint.y };
}
