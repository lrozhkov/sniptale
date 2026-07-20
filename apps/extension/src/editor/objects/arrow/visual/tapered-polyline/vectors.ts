import type { PointLike } from '../../types';

export function normalizeVector(vector: PointLike): PointLike {
  const length = Math.hypot(vector.x, vector.y);
  return length === 0 ? { x: 1, y: 0 } : { x: vector.x / length, y: vector.y / length };
}

export function getSegmentVector(start: PointLike, end: PointLike): PointLike {
  return normalizeVector({
    x: end.x - start.x,
    y: end.y - start.y,
  });
}

export function getNonZeroSegmentVector(start: PointLike, end: PointLike): PointLike | null {
  if (start.x === end.x && start.y === end.y) {
    return null;
  }

  return getSegmentVector(start, end);
}

export function addVectors(vectorA: PointLike, vectorB: PointLike): PointLike {
  return {
    x: vectorA.x + vectorB.x,
    y: vectorA.y + vectorB.y,
  };
}
