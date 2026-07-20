import type { PointLike } from '../../types';
import { interpolatePoint, resolvePolylineSegment } from './segment';
import type { PolylineFrame, PolylineLengthState, PolylineSample } from './types';
import { addVectors, getNonZeroSegmentVector, getSegmentVector, normalizeVector } from './vectors';

export function getPolylineSample(
  points: readonly PointLike[],
  lengthState: PolylineLengthState,
  distance: number
): PolylineSample {
  const segment = resolvePolylineSegment(points, lengthState, distance);
  const point = interpolatePoint(segment.start, segment.end, segment.ratio);
  const tangent = getSegmentVector(segment.start, segment.end);

  return {
    normal: { x: -tangent.y, y: tangent.x },
    point,
  };
}

function resolveVertexTangent(previous: PointLike, current: PointLike, next: PointLike): PointLike {
  const incoming = getNonZeroSegmentVector(previous, current);
  const outgoing = getNonZeroSegmentVector(current, next);
  if (!incoming && !outgoing) {
    return { x: 1, y: 0 };
  }
  if (!incoming) {
    return outgoing ?? { x: 1, y: 0 };
  }
  if (!outgoing) {
    return incoming;
  }

  const combined = addVectors(incoming, outgoing);
  if (combined.x === 0 && combined.y === 0) {
    return outgoing;
  }

  return normalizeVector(combined);
}

export function getSmoothedPolylineSample(
  points: readonly PointLike[],
  lengthState: PolylineLengthState,
  distance: number
): PolylineFrame {
  const segment = resolvePolylineSegment(points, lengthState, distance);
  const point = interpolatePoint(segment.start, segment.end, segment.ratio);
  const startTangent = resolveVertexTangent(segment.previous, segment.start, segment.end);
  const endTangent = resolveVertexTangent(segment.start, segment.end, segment.next);
  const tangent = normalizeVector({
    x: startTangent.x + (endTangent.x - startTangent.x) * segment.ratio,
    y: startTangent.y + (endTangent.y - startTangent.y) * segment.ratio,
  });

  return {
    normal: { x: -tangent.y, y: tangent.x },
    point,
    tangent,
  };
}
