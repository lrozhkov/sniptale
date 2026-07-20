import type { PointLike } from '../types';
import { polygonToPath, rotatePoint, translatePoint } from './points';

export function buildOrientedPolygon(
  vertices: readonly PointLike[],
  point: PointLike,
  angleRad: number
): string {
  return polygonToPath(
    [...vertices].reverse().map((vertex) => translatePoint(rotatePoint(vertex, angleRad), point))
  );
}

export function buildOrientedRect(
  center: PointLike,
  length: number,
  half: number,
  angleRad: number
): string {
  return buildOrientedPolygon(
    [
      { x: length / 2, y: half },
      { x: -length / 2, y: half },
      { x: -length / 2, y: -half },
      { x: length / 2, y: -half },
    ],
    center,
    angleRad
  );
}
