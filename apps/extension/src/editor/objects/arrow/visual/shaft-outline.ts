import type { PointLike } from '../types';
import { polygonToPath } from './points';
import { getOffsetJoinPoints } from './shaft-outline-joins';

export function buildShaftOutlinePath(points: readonly PointLike[], width: number): string {
  return buildVariableShaftOutlinePath(points, () => Math.max(1, width / 2));
}

export function buildDynamicShaftOutlinePath(points: readonly PointLike[], width: number): string {
  const baseHalfWidth = Math.max(1, width / 2);
  return buildVariableShaftOutlinePath(points, (_point, index) => {
    const ratio = points.length <= 1 ? 0 : index / (points.length - 1);
    return Math.max(0.75, baseHalfWidth * (0.38 + ratio * 0.9));
  });
}

function buildVariableShaftOutlinePath(
  points: readonly PointLike[],
  getHalfWidth: (point: PointLike, index: number) => number
): string {
  if (points.length < 2) {
    return polygonToPath([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  }

  const halfWidths = points.map((point, index) => getHalfWidth(point, index));
  const left = points.flatMap((_point, index) => getOffsetJoinPoints(points, index, halfWidths, 1));
  const right = points
    .flatMap((_point, index) => getOffsetJoinPoints(points, index, halfWidths, -1))
    .reverse();

  return polygonToPath([...left, ...right]);
}
