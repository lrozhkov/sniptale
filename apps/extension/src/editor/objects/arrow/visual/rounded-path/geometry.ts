import type { PointLike } from '../../types';

export function getPointDistance(from: PointLike, to: PointLike): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export function moveTowardPoint(from: PointLike, to: PointLike, distance: number): PointLike {
  const segmentLength = getPointDistance(from, to);
  if (segmentLength === 0) {
    return { ...from };
  }

  const ratio = Math.min(1, distance / segmentLength);
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  };
}
