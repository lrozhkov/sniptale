import type { PointLike } from '../../types';
import type { PolylineLengthState } from './types';

export function buildPolylineLengthState(points: readonly PointLike[]): PolylineLengthState {
  const distances = [0];
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) {
      continue;
    }

    total += Math.hypot(current.x - previous.x, current.y - previous.y);
    distances.push(total);
  }

  return { distances, total };
}
