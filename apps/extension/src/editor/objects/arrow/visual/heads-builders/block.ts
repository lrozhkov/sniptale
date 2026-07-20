import type { PointLike } from '../../types';
import { buildTriangleVertices } from '../heads-metrics';
import { rotatePoint, translatePoint } from '../points';
import { buildRoundedClosedPath } from '../rounded-path';

export function buildBlockArrowHeadPath(
  point: PointLike,
  angleRad: number,
  width: number,
  size?: number
): string {
  const triangle = buildTriangleVertices(width, size);
  const vertices = [triangle[1], triangle[0], triangle[2]]
    .filter((vertex): vertex is PointLike => Boolean(vertex))
    .map((vertex) => translatePoint(rotatePoint(vertex, angleRad), point));
  return buildRoundedClosedPath(vertices, {
    radius: Math.max(2, width * 0.28),
    roundedIndexes: new Set([0, 1, 2]),
  });
}
