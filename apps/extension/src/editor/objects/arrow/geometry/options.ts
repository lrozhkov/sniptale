import type { ArrowObjectOptions, PointLike } from '../types';
import { clonePoint, isPointLike } from './points';

export function buildArrowPointsFromOptions(
  options: Pick<ArrowObjectOptions, 'points' | 'start' | 'end' | 'control'>
): PointLike[] {
  if (Array.isArray(options.points) && options.points.length >= 2) {
    const sanitizedPoints = options.points.filter(isPointLike).map(clonePoint);
    if (sanitizedPoints.length >= 2) {
      return sanitizedPoints;
    }
  }

  if (!options.start || !options.end) {
    return [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
  }

  if (options.control) {
    return [options.start, options.control, options.end].map(clonePoint);
  }

  return [options.start, options.end].map(clonePoint);
}
