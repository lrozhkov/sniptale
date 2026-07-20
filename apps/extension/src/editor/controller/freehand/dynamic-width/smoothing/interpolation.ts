import { clamp, type DynamicStrokePoint } from '../types';

export function interpolatePoint(
  start: DynamicStrokePoint,
  end: DynamicStrokePoint,
  ratio: number
): DynamicStrokePoint {
  return {
    width: start.width + (end.width - start.width) * ratio,
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  };
}

export function interpolateByDistance(
  start: DynamicStrokePoint,
  end: DynamicStrokePoint,
  distance: number
): DynamicStrokePoint {
  const totalDistance = Math.hypot(end.x - start.x, end.y - start.y);
  if (totalDistance <= 0) {
    return { ...start };
  }

  return interpolatePoint(start, end, clamp(distance / totalDistance, 0, 1));
}
