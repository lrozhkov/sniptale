import { measureDistance, measurePathLength } from '../metrics';
import type { FreehandPointRecord } from '../points';

export function samplePolylineAtProgress(
  points: readonly FreehandPointRecord[],
  progress: number
): FreehandPointRecord {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  if (points.length === 1) {
    return { ...points[0]! };
  }

  const targetLength = measurePathLength(points) * Math.max(0, Math.min(1, progress));
  let traversed = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) {
      continue;
    }

    const segmentLength = measureDistance(previous, current);
    if (segmentLength === 0) {
      continue;
    }

    if (traversed + segmentLength >= targetLength) {
      const ratio = (targetLength - traversed) / segmentLength;
      return {
        x: previous.x + (current.x - previous.x) * ratio,
        y: previous.y + (current.y - previous.y) * ratio,
      };
    }

    traversed += segmentLength;
  }

  return { ...points[points.length - 1]! };
}
