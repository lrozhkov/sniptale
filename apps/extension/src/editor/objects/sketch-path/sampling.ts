import { clampSketchValue, createSketchNoise } from './numeric';
import {
  getQuadraticSketchPoint,
  getSketchSegmentLength,
  getSketchSegmentNormal,
  interpolateSketchPoint,
} from './geometry';
import type { SketchPoint, SketchPolylineOptions } from './types';

const MIN_SEGMENT_SAMPLES = 4;
const MAX_SEGMENT_SAMPLES = 14;

function getSegmentSampleCount(length: number): number {
  return Math.round(clampSketchValue(length / 28, MIN_SEGMENT_SAMPLES, MAX_SEGMENT_SAMPLES));
}

function getBowedControlPoint(
  start: SketchPoint,
  end: SketchPoint,
  normal: SketchPoint,
  options: SketchPolylineOptions,
  segmentIndex: number
): SketchPoint {
  const length = getSketchSegmentLength(start, end);
  const bowing = Math.max(0, options.bowing ?? 0);
  const direction = createSketchNoise(options.seed + 17, segmentIndex) >= 0 ? 1 : -1;
  const amount = Math.min(length * 0.025, options.strokeWidth * 0.65 + 5) * bowing * direction;

  return {
    x: (start.x + end.x) / 2 + normal.x * amount,
    y: (start.y + end.y) / 2 + normal.y * amount,
  };
}

function getJitterAmount(options: SketchPolylineOptions): number {
  return Math.max(0, options.roughness) * Math.max(0.45, Math.min(3.25, options.strokeWidth * 0.1));
}

function getSketchPolylineSegmentSample(
  start: SketchPoint,
  end: SketchPoint,
  options: SketchPolylineOptions,
  segmentIndex: number,
  sampleIndex: number
): SketchPoint {
  const sampleCount = getSegmentSampleCount(getSketchSegmentLength(start, end));
  if (sampleIndex <= 0) {
    return { ...start };
  }

  const safeRatio = clampSketchValue(sampleIndex / sampleCount, 0, 1);
  const normal = getSketchSegmentNormal(start, end);
  const control = getBowedControlPoint(start, end, normal, options, segmentIndex);
  const point = getQuadraticSketchPoint(start, control, end, safeRatio);
  const jitterAmount = getJitterAmount(options);
  if (safeRatio >= 1 || jitterAmount <= 0) {
    return point;
  }

  const taper = Math.sin(Math.PI * safeRatio);
  const noiseIndex = segmentIndex * 101 + sampleIndex - 1;
  return {
    x: point.x + normal.x * createSketchNoise(options.seed, noiseIndex) * jitterAmount * taper,
    y: point.y + normal.y * createSketchNoise(options.seed + 31, noiseIndex) * jitterAmount * taper,
  };
}

function createSegmentSamples(
  start: SketchPoint,
  end: SketchPoint,
  options: SketchPolylineOptions,
  segmentIndex: number
): SketchPoint[] {
  const length = getSketchSegmentLength(start, end);
  if (length <= 0.0001) {
    return [];
  }

  const samples = getSegmentSampleCount(length);

  return Array.from({ length: samples }, (_, sampleIndex) => {
    return getSketchPolylineSegmentSample(start, end, options, segmentIndex, sampleIndex + 1);
  });
}

export function getSketchPolylineSegmentPoint(
  start: SketchPoint,
  end: SketchPoint,
  options: SketchPolylineOptions,
  segmentIndex: number,
  ratio: number
): SketchPoint {
  const safeRatio = clampSketchValue(ratio, 0, 1);
  const sampleCount = getSegmentSampleCount(getSketchSegmentLength(start, end));
  const scaledIndex = safeRatio * sampleCount;
  const previousIndex = Math.floor(scaledIndex);
  const nextIndex = Math.ceil(scaledIndex);
  const previous = getSketchPolylineSegmentSample(start, end, options, segmentIndex, previousIndex);
  const next = getSketchPolylineSegmentSample(start, end, options, segmentIndex, nextIndex);
  return interpolateSketchPoint(previous, next, scaledIndex - previousIndex);
}

export function buildSketchPolylinePoints(
  points: readonly SketchPoint[],
  options: SketchPolylineOptions
): SketchPoint[] {
  const start = points[0];
  if (!start) {
    return [];
  }

  const samples: SketchPoint[] = [{ ...start }];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) {
      continue;
    }

    samples.push(...createSegmentSamples(previous, current, options, index - 1));
  }

  return samples;
}
