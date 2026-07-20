import { measureDistance, measurePathLength } from '../metrics';
import type { FreehandPointRecord } from '../points';

export function measureProgressRatios(points: readonly FreehandPointRecord[]): number[] {
  if (points.length === 0) {
    return [];
  }

  const totalLength = Math.max(measurePathLength(points), 1);
  const progress = [0];
  let traversed = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) {
      progress.push(traversed / totalLength);
      continue;
    }

    traversed += measureDistance(previous, current);
    progress.push(Math.min(1, traversed / totalLength));
  }

  return progress;
}
