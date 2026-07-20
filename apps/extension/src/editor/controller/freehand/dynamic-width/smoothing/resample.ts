import type { DynamicStrokePoint } from '../types';
import { SMOOTHING_STEP_PX } from './constants';
import { interpolateByDistance } from './interpolation';

export function resampleDynamicStrokePoints(
  points: readonly DynamicStrokePoint[]
): DynamicStrokePoint[] {
  return resampleDynamicStrokePointsWithStep(points, SMOOTHING_STEP_PX);
}

export function resampleDynamicStrokePointsWithStep(
  points: readonly DynamicStrokePoint[],
  smoothingStepPx: number
): DynamicStrokePoint[] {
  const firstPoint = points[0];
  if (!firstPoint || points.length < 2) {
    return points.map((point) => ({ ...point }));
  }

  const stepDistance = Math.max(1, smoothingStepPx);
  const resampled = [{ ...firstPoint }];
  let carryDistance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const segmentDistance = Math.hypot(end.x - start.x, end.y - start.y);
    if (segmentDistance <= 0) {
      continue;
    }

    let nextDistance = stepDistance - carryDistance;
    while (nextDistance < segmentDistance) {
      resampled.push(interpolateByDistance(start, end, nextDistance));
      nextDistance += stepDistance;
    }
    carryDistance = segmentDistance - (nextDistance - stepDistance);
  }

  const lastPoint = points[points.length - 1]!;
  const previousPoint = resampled[resampled.length - 1];
  if (!previousPoint || previousPoint.x !== lastPoint.x || previousPoint.y !== lastPoint.y) {
    resampled.push({ ...lastPoint });
  }
  return resampled;
}
