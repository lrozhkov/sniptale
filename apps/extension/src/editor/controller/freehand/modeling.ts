import { measureBounds, measureDistance, measurePathLength, type Bounds } from './metrics';
import { resamplePointCloud } from './point-cloud';
import type { FreehandPointRecord } from './points';

const CLOSED_STROKE_RATIO = 0.18;
const MAX_SAMPLED_POINTS = 64;
const MIN_SAMPLED_POINTS = 24;
const SAMPLE_STEP_PX = 6;

export interface ModeledFreehandStroke {
  bounds: Required<Bounds>;
  centerline: FreehandPointRecord[];
  closed: boolean;
  diagonal: number;
  points: FreehandPointRecord[];
  sampledPoints: FreehandPointRecord[];
}

function dedupeSequentialPoints(points: readonly FreehandPointRecord[]): FreehandPointRecord[] {
  return points.reduce<FreehandPointRecord[]>((deduped, point) => {
    const previous = deduped[deduped.length - 1];
    if (previous?.x === point.x && previous.y === point.y) {
      return deduped;
    }

    deduped.push({ x: point.x, y: point.y });
    return deduped;
  }, []);
}

function stripClosingPoint(points: readonly FreehandPointRecord[]): FreehandPointRecord[] {
  if (points.length < 2) {
    return [...points];
  }

  const first = points[0]!;
  const last = points[points.length - 1]!;
  return measureDistance(first, last) <= 0.001 ? [...points.slice(0, -1)] : [...points];
}

function isClosedStroke(points: readonly FreehandPointRecord[], bounds: Required<Bounds>): boolean {
  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) {
    return false;
  }

  const diagonal = Math.hypot(bounds.width, bounds.height);
  return diagonal > 0 && measureDistance(start, end) / diagonal <= CLOSED_STROKE_RATIO;
}

function resolveSampleCount(centerline: readonly FreehandPointRecord[]): number {
  const pathLength = measurePathLength(centerline);
  return Math.max(
    MIN_SAMPLED_POINTS,
    Math.min(MAX_SAMPLED_POINTS, Math.round(pathLength / SAMPLE_STEP_PX))
  );
}

export function createModeledFreehandStroke(
  rawPoints: readonly FreehandPointRecord[]
): ModeledFreehandStroke | null {
  const points = dedupeSequentialPoints(rawPoints);
  if (points.length < 3) {
    return null;
  }

  const bounds = measureBounds(points) as Required<Bounds>;
  const closed = isClosedStroke(points, bounds);
  const centerline = closed ? stripClosingPoint(points) : points;
  if (centerline.length < 3) {
    return null;
  }

  const sampledPoints = resamplePointCloud(centerline, resolveSampleCount(centerline));
  return {
    bounds,
    centerline,
    closed,
    diagonal: Math.hypot(bounds.width, bounds.height),
    points,
    sampledPoints,
  };
}
