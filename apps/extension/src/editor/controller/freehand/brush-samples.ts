import type { Point } from 'fabric';
import type { FreehandPointRecord } from './points';
import { readFreehandSamplePoints, type FreehandStrokeSample } from './samples';

const DYNAMIC_WIDTH_MIN_SAMPLE_DISTANCE_PX = 2;

export function resolvePointerTimestamp(event: { timeStamp?: number } | null | undefined): number {
  if (typeof event?.timeStamp === 'number' && Number.isFinite(event.timeStamp)) {
    return event.timeStamp;
  }

  return performance.now();
}

export function resolveFreehandStrokeSamples(options: {
  currentTimestamp: number;
  points: ReadonlyArray<Point>;
  strokeSamples: ReadonlyArray<FreehandStrokeSample>;
}): FreehandStrokeSample[] {
  if (options.strokeSamples.length >= options.points.length && options.strokeSamples.length > 0) {
    return options.strokeSamples.map((sample) => ({ ...sample }));
  }

  return options.points.map(({ x, y }) => ({
    t: options.currentTimestamp,
    x,
    y,
  }));
}

export function resolveFreehandStrokePoints(
  samples: ReadonlyArray<FreehandStrokeSample>
): FreehandPointRecord[] {
  return readFreehandSamplePoints(samples);
}

export function appendFreehandPointSample(options: {
  currentTimestamp: number;
  point: Point;
  strokeSamples: FreehandStrokeSample[];
}): void {
  options.strokeSamples.push({
    t: options.currentTimestamp,
    x: options.point.x,
    y: options.point.y,
  });
}

export function mergeDenseDynamicWidthPoint(options: {
  currentTimestamp: number;
  dynamicWidth: boolean;
  point: Point;
  points: Point[];
  strokeSamples: FreehandStrokeSample[];
}): boolean {
  if (!options.dynamicWidth || options.points.length < 2) {
    return false;
  }

  const previousPoint = options.points[options.points.length - 2];
  const lastPoint = options.points[options.points.length - 1];
  if (!previousPoint || !lastPoint) {
    return false;
  }

  const distanceFromLast = Math.hypot(options.point.x - lastPoint.x, options.point.y - lastPoint.y);
  if (distanceFromLast >= DYNAMIC_WIDTH_MIN_SAMPLE_DISTANCE_PX) {
    return false;
  }

  const distanceFromPrevious = Math.hypot(
    options.point.x - previousPoint.x,
    options.point.y - previousPoint.y
  );
  if (distanceFromPrevious >= DYNAMIC_WIDTH_MIN_SAMPLE_DISTANCE_PX) {
    return false;
  }

  options.points[options.points.length - 1] = options.point;
  options.strokeSamples[options.strokeSamples.length - 1] = {
    t: options.currentTimestamp,
    x: options.point.x,
    y: options.point.y,
  };
  return true;
}
