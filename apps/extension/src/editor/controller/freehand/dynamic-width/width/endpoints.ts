import type { FreehandPointRecord } from '../../points';
import { clamp, type DynamicStrokePoint } from '../types';

const EDGE_WIDTH_DISTANCE_PX = 24;

function measurePointDistance(start: FreehandPointRecord, end: FreehandPointRecord): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function measureStrokeLength(points: readonly DynamicStrokePoint[]): number {
  return points.reduce((sum, point, index) => {
    const previous = points[index - 1];
    return previous ? sum + measurePointDistance(previous, point) : sum;
  }, 0);
}

function resolveWidthAtDistance(
  points: readonly DynamicStrokePoint[],
  distanceFromStart: number
): number {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    distance += measurePointDistance(previous, current);
    if (distance >= distanceFromStart) {
      return current.width;
    }
  }
  return points[points.length - 1]?.width ?? 1;
}

export function stabilizeEndpointWidths(
  points: readonly DynamicStrokePoint[]
): DynamicStrokePoint[] {
  const normalized = points.map((point) => ({ ...point }));
  if (normalized.length < 2) {
    return normalized;
  }

  const strokeLength = measureStrokeLength(normalized);
  const edgeDistance = Math.min(EDGE_WIDTH_DISTANCE_PX, strokeLength / 3);
  if (edgeDistance <= 0) {
    return normalized;
  }
  const startWidth = resolveWidthAtDistance(normalized, edgeDistance);
  const endWidth = resolveWidthAtDistance(normalized, Math.max(0, strokeLength - edgeDistance));
  let distance = 0;
  normalized.forEach((point, index) => {
    const previous = normalized[index - 1];
    if (previous) {
      distance += measurePointDistance(previous, point);
    }

    const startBlend = clamp(distance / edgeDistance, 0, 1);
    const endBlend = clamp((strokeLength - distance) / edgeDistance, 0, 1);
    if (startBlend < 1) {
      point.width = startWidth * (1 - startBlend) + point.width * startBlend;
    }
    if (endBlend < 1) {
      point.width = endWidth * (1 - endBlend) + point.width * endBlend;
    }
  });
  return normalized;
}
