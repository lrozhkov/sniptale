import type { PointLike } from '../types';

export function getNormal(previous: PointLike, next: PointLike): PointLike {
  const dx = next.x - previous.x;
  const dy = next.y - previous.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return { x: 0, y: -1 };
  }

  return {
    x: -dy / distance,
    y: dx / distance,
  };
}

export function getSegmentLength(start: PointLike, end: PointLike): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function offsetPoint(point: PointLike, normal: PointLike, amount: number): PointLike {
  return {
    x: point.x + normal.x * amount,
    y: point.y + normal.y * amount,
  };
}

export function getSegmentNormal(points: readonly PointLike[], startIndex: number): PointLike {
  const start = points[startIndex];
  const end = points[startIndex + 1];
  return start && end ? getNormal(start, end) : { x: 0, y: -1 };
}

export function getLineIntersection(
  startA: PointLike,
  endA: PointLike,
  startB: PointLike,
  endB: PointLike
): PointLike | null {
  const dxA = endA.x - startA.x;
  const dyA = endA.y - startA.y;
  const dxB = endB.x - startB.x;
  const dyB = endB.y - startB.y;
  const denominator = dxA * dyB - dyA * dxB;
  if (Math.abs(denominator) < 0.0001) {
    return null;
  }

  const ratio = ((startB.x - startA.x) * dyB - (startB.y - startA.y) * dxB) / denominator;
  return {
    x: startA.x + dxA * ratio,
    y: startA.y + dyA * ratio,
  };
}
