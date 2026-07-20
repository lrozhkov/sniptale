import type { PointLike } from '../types';
import { getLineIntersection, getNormal, getSegmentNormal, offsetPoint } from './outline-geometry';

function getOutlineNormal(points: readonly PointLike[], index: number): PointLike {
  const point = points[index];
  const previous = points[Math.max(0, index - 1)] ?? point;
  const next = points[Math.min(points.length - 1, index + 1)] ?? point;
  return previous && next ? getNormal(previous, next) : { x: 0, y: -1 };
}

function isMiterReasonable(point: PointLike, center: PointLike, halfWidth: number): boolean {
  return (
    Math.hypot(point.x - center.x, point.y - center.y) <= Math.max(halfWidth * 1.55, halfWidth + 2)
  );
}

export function getOffsetJoinPoints(
  points: readonly PointLike[],
  index: number,
  halfWidths: readonly number[],
  side: 1 | -1
): PointLike[] {
  const point = points[index];
  if (!point) {
    return [{ x: 0, y: 0 }];
  }

  const halfWidth = halfWidths[index] ?? 1;
  if (index === 0) {
    return [offsetPoint(point, getSegmentNormal(points, 0), halfWidth * side)];
  }
  if (index === points.length - 1) {
    return [offsetPoint(point, getSegmentNormal(points, index - 1), halfWidth * side)];
  }

  const previous = points[index - 1];
  const next = points[index + 1];
  if (!previous || !next) {
    return [offsetPoint(point, getOutlineNormal(points, index), halfWidth * side)];
  }

  const previousNormal = getSegmentNormal(points, index - 1);
  const nextNormal = getSegmentNormal(points, index);
  const previousHalfWidth = halfWidths[index - 1] ?? halfWidth;
  const nextHalfWidth = halfWidths[index + 1] ?? halfWidth;
  const intersection = getLineIntersection(
    offsetPoint(previous, previousNormal, previousHalfWidth * side),
    offsetPoint(point, previousNormal, halfWidth * side),
    offsetPoint(point, nextNormal, halfWidth * side),
    offsetPoint(next, nextNormal, nextHalfWidth * side)
  );

  if (intersection && isMiterReasonable(intersection, point, halfWidth)) {
    return [intersection];
  }

  return [
    offsetPoint(point, previousNormal, halfWidth * side),
    offsetPoint(point, nextNormal, halfWidth * side),
  ];
}
