import type { FreehandStrokeSample } from '../../samples';
import { clamp } from '../types';
import { measureSampleDistance } from './samples';

const MIN_WIDTH_RATIO = 0.34;
const SPEED_TO_THINNESS = 1.35;
const START_AVERAGE_DISTANCE_PX = 32;

export function resolveSpeedRatios(samples: readonly FreehandStrokeSample[]): number[] {
  const segmentRatios = samples.map((sample, index) => {
    const previous = samples[index - 1];
    const next = samples[index + 1];
    const neighbor = previous ?? next;
    if (!neighbor) {
      return 1;
    }

    const distance = measureSampleDistance(sample, neighbor);
    const elapsed = Math.max(1, Math.abs(sample.t - neighbor.t));
    return clamp(1 - distance / elapsed / SPEED_TO_THINNESS, MIN_WIDTH_RATIO, 1);
  });
  return segmentRatios.map((ratio, index) => {
    const previous = segmentRatios[Math.max(0, index - 1)] ?? ratio;
    const next = segmentRatios[Math.min(segmentRatios.length - 1, index + 1)] ?? ratio;
    return previous * 0.25 + ratio * 0.5 + next * 0.25;
  });
}

export function resolveWarmStartRatios(
  samples: readonly FreehandStrokeSample[],
  ratios: readonly number[]
): number[] {
  let distance = 0;
  let weightedRatio = 0;
  let totalWeight = 0;
  const distances = samples.map((sample, index) => {
    const previous = samples[index - 1];
    if (previous) {
      distance += measureSampleDistance(previous, sample);
    }
    if (distance <= START_AVERAGE_DISTANCE_PX) {
      const weight = Math.max(1, distance);
      weightedRatio += (ratios[index] ?? 1) * weight;
      totalWeight += weight;
    }
    return distance;
  });
  const warmRatio = totalWeight > 0 ? weightedRatio / totalWeight : (ratios[0] ?? 1);
  return ratios.map((ratio, index) => {
    const blend = clamp((distances[index] ?? 0) / START_AVERAGE_DISTANCE_PX, 0, 1);
    return warmRatio * (1 - blend) + ratio * blend;
  });
}
