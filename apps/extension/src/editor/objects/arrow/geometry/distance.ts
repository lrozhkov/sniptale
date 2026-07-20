import { clamp } from '../../../document/model';
import type { PointLike } from '../types';

export function distanceToSegmentSquared(
  point: PointLike,
  start: PointLike,
  end: PointLike
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
  }

  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
  const ratio = clamp(projection, 0, 1);
  const projected = {
    x: start.x + dx * ratio,
    y: start.y + dy * ratio,
  };

  return (point.x - projected.x) ** 2 + (point.y - projected.y) ** 2;
}

export function distanceSquared(pointA: PointLike, pointB: PointLike): number {
  return (pointA.x - pointB.x) ** 2 + (pointA.y - pointB.y) ** 2;
}
