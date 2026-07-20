import type { DynamicFreehandPathBuildOptions, DynamicStrokePoint } from '../types';
import { DEFAULT_SMOOTHING_WEIGHT, SHARP_CORNER_SMOOTHING_WEIGHT } from './constants';
import { isSharpCorner } from './corners';
import { resolveSmoothingIterations } from './iterations';
import { resampleDynamicStrokePoints, resampleDynamicStrokePointsWithStep } from './resample';

function smoothPoint(
  previous: DynamicStrokePoint,
  current: DynamicStrokePoint,
  next: DynamicStrokePoint
): DynamicStrokePoint {
  const smoothingWeight = isSharpCorner(previous, current, next)
    ? SHARP_CORNER_SMOOTHING_WEIGHT
    : DEFAULT_SMOOTHING_WEIGHT;
  return {
    width:
      previous.width * smoothingWeight +
      current.width * (1 - smoothingWeight * 2) +
      next.width * smoothingWeight,
    x:
      previous.x * smoothingWeight +
      current.x * (1 - smoothingWeight * 2) +
      next.x * smoothingWeight,
    y:
      previous.y * smoothingWeight +
      current.y * (1 - smoothingWeight * 2) +
      next.y * smoothingWeight,
  };
}

export function smoothDynamicStrokePoints(
  points: readonly DynamicStrokePoint[],
  smoothingLevel: number,
  options?: DynamicFreehandPathBuildOptions
): DynamicStrokePoint[] {
  const iterations = resolveSmoothingIterations(smoothingLevel, options?.smoothingIterationLimit);
  let smoothed =
    typeof options?.smoothingStepPx === 'number'
      ? resampleDynamicStrokePointsWithStep(points, options.smoothingStepPx)
      : resampleDynamicStrokePoints(points);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (smoothed.length < 3) {
      break;
    }

    const nextPoints = [smoothed[0]!];
    for (let index = 1; index < smoothed.length - 1; index += 1) {
      nextPoints.push(smoothPoint(smoothed[index - 1]!, smoothed[index]!, smoothed[index + 1]!));
    }
    nextPoints.push(smoothed[smoothed.length - 1]!);
    smoothed = nextPoints;
  }
  return smoothed;
}
