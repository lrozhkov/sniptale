import { clonePoint } from '../../geometry/points';
import type { ArrowCurveSegment, PointLike } from '../../types';
import { getFirstPoint } from '../points';

const CURVE_SEGMENT_STEPS = 64;

export function buildArrowCurveSegments(points: PointLike[]): ArrowCurveSegment[] {
  const segments: ArrowCurveSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (!start || !end) {
      continue;
    }

    const previous = points[Math.max(0, index - 1)] ?? start;
    const next = points[Math.min(points.length - 1, index + 2)] ?? end;

    segments.push({
      control1: {
        x: start.x + (end.x - previous.x) / 6,
        y: start.y + (end.y - previous.y) / 6,
      },
      control2: {
        x: end.x - (next.x - start.x) / 6,
        y: end.y - (next.y - start.y) / 6,
      },
      end: clonePoint(end),
    });
  }

  return segments;
}

export function sampleCubicPoint(
  start: PointLike,
  segment: ArrowCurveSegment,
  ratio: number
): PointLike {
  const inverse = 1 - ratio;
  return {
    x:
      inverse ** 3 * start.x +
      3 * inverse ** 2 * ratio * segment.control1.x +
      3 * inverse * ratio ** 2 * segment.control2.x +
      ratio ** 3 * segment.end.x,
    y:
      inverse ** 3 * start.y +
      3 * inverse ** 2 * ratio * segment.control1.y +
      3 * inverse * ratio ** 2 * segment.control2.y +
      ratio ** 3 * segment.end.y,
  };
}

export function sampleArrowCurve(points: PointLike[]): PointLike[] {
  const start = getFirstPoint(points);
  if (!start) {
    return [];
  }

  const sampled = [clonePoint(start)];
  let segmentStart = start;
  buildArrowCurveSegments(points).forEach((segment) => {
    for (let step = 1; step <= CURVE_SEGMENT_STEPS; step += 1) {
      sampled.push(sampleCubicPoint(segmentStart, segment, step / CURVE_SEGMENT_STEPS));
    }
    segmentStart = segment.end;
  });

  return sampled;
}
