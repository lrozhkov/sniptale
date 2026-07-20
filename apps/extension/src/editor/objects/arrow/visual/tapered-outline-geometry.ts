import type { PointLike } from '../types';

export function offsetTaperedOutlinePoint(
  point: PointLike,
  normal: PointLike,
  amount: number
): PointLike {
  return {
    x: point.x + normal.x * amount,
    y: point.y + normal.y * amount,
  };
}
