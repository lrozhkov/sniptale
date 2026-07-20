import type { EditorArrowSettings } from '../../../features/editor/document/types';
import { buildArrowPointsFromOptions } from './geometry/options';
import { clonePoint, isPointLike } from './geometry/points';
import { normalizeArrowPoints } from './geometry/normalization';
import type { PointLike } from './types';
import { getEffectiveArrowMode, resolveArrowType } from './variant';

interface ArrowPointUpdateOptions {
  points?: PointLike[];
  start?: PointLike;
  end?: PointLike;
  control?: PointLike | null;
}

export function pickArrowPointUpdateOptions(
  options: Pick<ArrowPointUpdateOptions, 'points' | 'start' | 'end' | 'control'>
): Partial<ArrowPointUpdateOptions> {
  return {
    ...(options.points === undefined ? {} : { points: options.points }),
    ...(options.start === undefined ? {} : { start: options.start }),
    ...(options.end === undefined ? {} : { end: options.end }),
    ...(options.control === undefined ? {} : { control: options.control }),
  };
}

export function resolveArrowUpdatePoints(
  previousPoints: PointLike[],
  settings: EditorArrowSettings,
  options: ArrowPointUpdateOptions
): PointLike[] {
  let points =
    Array.isArray(options.points) && options.points.length > 0
      ? options.points.filter(isPointLike).map(clonePoint)
      : previousPoints.map(clonePoint);

  if (points.length === 0) {
    points = buildArrowPointsFromOptions(pickArrowPointUpdateOptions(options));
  }

  if (points.length > 0) {
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    if (firstPoint && lastPoint) {
      points[0] = clonePoint(options.start ?? firstPoint);
      points[points.length - 1] = clonePoint(options.end ?? lastPoint);
    }
  }

  if (options.control && getEffectiveArrowMode(settings) === 'curve') {
    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    if (firstPoint && lastPoint) {
      points = [firstPoint, clonePoint(options.control), lastPoint];
    }
  }

  if (resolveArrowType(settings.arrowType) === 'elbow') {
    const firstPoint = points[0];
    if (points.length === 1 && firstPoint) {
      return [clonePoint(firstPoint), clonePoint(firstPoint)];
    }
    return points;
  }

  return normalizeArrowPoints(points, settings);
}
