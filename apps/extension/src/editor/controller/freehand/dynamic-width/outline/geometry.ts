import type { DynamicStrokePoint, DynamicStrokeVector } from '../types';

export function resolveNormal(
  points: readonly DynamicStrokePoint[],
  index: number
): DynamicStrokeVector {
  const previous = points[Math.max(0, index - 1)]!;
  const next = points[Math.min(points.length - 1, index + 1)]!;
  const length = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
  return {
    x: -(next.y - previous.y) / length,
    y: (next.x - previous.x) / length,
  };
}

export function resolveSegmentNormal(
  start: DynamicStrokePoint,
  end: DynamicStrokePoint
): DynamicStrokeVector {
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  return {
    x: -(end.y - start.y) / length,
    y: (end.x - start.x) / length,
  };
}

export function invertNormal(normal: DynamicStrokeVector): DynamicStrokeVector {
  return { x: -normal.x, y: -normal.y };
}

export function resolveTangent(
  points: readonly DynamicStrokePoint[],
  index: number
): DynamicStrokeVector {
  const previous = points[Math.max(0, index - 1)]!;
  const next = points[Math.min(points.length - 1, index + 1)]!;
  const length = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
  return {
    x: (next.x - previous.x) / length,
    y: (next.y - previous.y) / length,
  };
}
