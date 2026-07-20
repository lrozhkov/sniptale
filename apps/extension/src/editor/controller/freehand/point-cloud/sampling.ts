import type { FreehandPointRecord } from '../points';
import { measureDistance, measurePathLength } from '../metrics';

function interpolatePoint(
  start: FreehandPointRecord,
  end: FreehandPointRecord,
  ratio: number
): FreehandPointRecord {
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  };
}

export function resamplePointCloud(
  points: readonly FreehandPointRecord[],
  targetSize: number
): FreehandPointRecord[] {
  if (points.length === 0) {
    return [];
  }

  const interval = measurePathLength(points) / Math.max(1, targetSize - 1);
  const resampled = [{ ...points[0]! }];
  let distanceAccumulator = 0;
  let previousPoint = points[0]!;

  for (let index = 1; index < points.length; index += 1) {
    const currentPoint = points[index];
    if (!currentPoint) {
      continue;
    }

    let segmentStart = previousPoint;
    let segmentDistance = measureDistance(segmentStart, currentPoint);
    while (
      segmentDistance > 0 &&
      distanceAccumulator + segmentDistance >= interval &&
      resampled.length < targetSize
    ) {
      const ratio = (interval - distanceAccumulator) / segmentDistance;
      const nextPoint = interpolatePoint(segmentStart, currentPoint, ratio);
      resampled.push(nextPoint);
      segmentStart = nextPoint;
      segmentDistance = measureDistance(segmentStart, currentPoint);
      distanceAccumulator = 0;
    }

    distanceAccumulator += segmentDistance;
    previousPoint = currentPoint;
  }

  while (resampled.length < targetSize) {
    resampled.push({ ...resampled[resampled.length - 1]! });
  }

  return resampled;
}
