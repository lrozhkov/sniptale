import type { FreehandPointRecord } from '../../points';
import type { FreehandStrokeSample } from '../../samples';

export function normalizeStrokeSamples(
  points: readonly FreehandPointRecord[],
  samples: readonly FreehandStrokeSample[] | null | undefined
): FreehandStrokeSample[] {
  if (samples?.length === points.length) {
    return samples.map((sample) => ({ t: sample.t, x: sample.x, y: sample.y }));
  }

  return points.map((point, index) => ({ ...point, t: index * 16 }));
}

export function measureSampleDistance(
  start: FreehandStrokeSample,
  end: FreehandStrokeSample
): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}
