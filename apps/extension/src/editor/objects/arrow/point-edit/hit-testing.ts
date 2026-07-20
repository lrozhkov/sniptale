import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import { distanceSquared, distanceToSegmentSquared } from '../geometry/distance';
import type { PointLike } from '../types';

const ARROW_DOUBLE_CLICK_POINT_HIT_THRESHOLD_MIN = 8;
const ARROW_DOUBLE_CLICK_POINT_HIT_WIDTH_MULTIPLIER = 1.75;

export function clonePoint(point: PointLike): PointLike {
  return { x: point.x, y: point.y };
}

export function findNearestSegmentIndex(points: readonly PointLike[], point: PointLike): number {
  let nearestSegmentIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentStart = points[index];
    const segmentEnd = points[index + 1];
    if (!segmentStart || !segmentEnd) {
      continue;
    }

    const distance = distanceToSegmentSquared(point, segmentStart, segmentEnd);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestSegmentIndex = index;
    }
  }

  return nearestSegmentIndex;
}

export function findNearestInternalPointIndex(
  points: readonly PointLike[],
  point: PointLike,
  thresholdSquared: number
): number {
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < points.length - 1; index += 1) {
    const currentPoint = points[index];
    if (!currentPoint) {
      continue;
    }

    const distance = distanceSquared(point, currentPoint);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  return nearestDistance <= thresholdSquared ? nearestIndex : -1;
}

export function getDoubleClickPointHitThresholdSquared(settings: EditorArrowSettings): number {
  const threshold = Math.max(
    ARROW_DOUBLE_CLICK_POINT_HIT_THRESHOLD_MIN,
    settings.width * ARROW_DOUBLE_CLICK_POINT_HIT_WIDTH_MULTIPLIER
  );
  return threshold ** 2;
}
