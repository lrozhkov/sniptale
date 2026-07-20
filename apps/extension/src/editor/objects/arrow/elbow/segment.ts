import type { PointLike } from '../types';
import { clonePoint } from './points';
import { normalizeElbowPoints } from './route';
import type { Axis } from './types';

export function isElbowInternalSegment(
  points: readonly PointLike[],
  segmentEndIndex: number
): boolean {
  return segmentEndIndex > 1 && segmentEndIndex < points.length - 1;
}

function getElbowSegmentAxis(points: readonly PointLike[], segmentEndIndex: number): Axis | null {
  const start = points[segmentEndIndex - 1];
  const end = points[segmentEndIndex];
  if (!start || !end) {
    return null;
  }

  return Math.abs(end.x - start.x) >= Math.abs(end.y - start.y) ? 'horizontal' : 'vertical';
}

export function getElbowSegmentMidpoint(
  points: readonly PointLike[],
  segmentEndIndex: number
): PointLike | null {
  const start = points[segmentEndIndex - 1];
  const end = points[segmentEndIndex];
  if (!start || !end || !isElbowInternalSegment(points, segmentEndIndex)) {
    return null;
  }

  return {
    x: start.x + (end.x - start.x) / 2,
    y: start.y + (end.y - start.y) / 2,
  };
}

export function moveElbowSegment(
  points: readonly PointLike[],
  segmentEndIndex: number,
  controlPoint: PointLike
): PointLike[] {
  const axis = getElbowSegmentAxis(points, segmentEndIndex);
  if (!axis || !isElbowInternalSegment(points, segmentEndIndex)) {
    return points.map(clonePoint);
  }

  const nextPoints = points.map(clonePoint);
  const start = nextPoints[segmentEndIndex - 1];
  const end = nextPoints[segmentEndIndex];
  if (!start || !end) {
    return nextPoints;
  }

  if (axis === 'horizontal') {
    start.y = controlPoint.y;
    end.y = controlPoint.y;
  } else {
    start.x = controlPoint.x;
    end.x = controlPoint.x;
  }

  return normalizeElbowPoints(nextPoints);
}
