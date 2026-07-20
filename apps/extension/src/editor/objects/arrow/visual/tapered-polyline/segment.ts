import { clamp } from '../../../../document/model';
import type { PointLike } from '../../types';
import type { PolylineLengthState, ResolvedPolylineSegment } from './types';

function getSampleIndex(lengthState: PolylineLengthState, distance: number): number {
  return lengthState.distances.findIndex((current) => current >= distance);
}

export function resolvePolylineSegment(
  points: readonly PointLike[],
  lengthState: PolylineLengthState,
  distance: number
): ResolvedPolylineSegment {
  const clampedDistance = clamp(distance, 0, lengthState.total);
  const sampleIndex = getSampleIndex(lengthState, clampedDistance);
  const resolvedIndex = sampleIndex <= 0 ? 1 : sampleIndex;
  const start = points[resolvedIndex - 1] ?? points[0] ?? { x: 0, y: 0 };
  const end = points[resolvedIndex] ?? start;
  const segmentStartDistance = lengthState.distances[resolvedIndex - 1] ?? 0;
  const segmentEndDistance = lengthState.distances[resolvedIndex] ?? segmentStartDistance;
  const segmentLength = Math.max(1e-6, segmentEndDistance - segmentStartDistance);

  return {
    end,
    next: points[Math.min(points.length - 1, resolvedIndex + 1)] ?? end,
    previous: points[Math.max(0, resolvedIndex - 2)] ?? start,
    ratio: (clampedDistance - segmentStartDistance) / segmentLength,
    start,
  };
}

export function interpolatePoint(start: PointLike, end: PointLike, ratio: number): PointLike {
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  };
}
