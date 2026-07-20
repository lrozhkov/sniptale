import { clonePoint, normalizeArrowPoints, parseArrowPointsJson } from './geometry';
import type { ArrowPathInstance } from './controls.types';
import type { PointLike } from './types';
import { readArrowSettings } from './settings';

export function readArrowPoints(arrow: ArrowPathInstance): PointLike[] {
  const settings = readArrowSettings(arrow);
  return normalizeArrowPoints(readArrowAuthoredPoints(arrow), settings);
}

export function readArrowAuthoredPoints(arrow: ArrowPathInstance): PointLike[] {
  const serializedPoints = parseArrowPointsJson(arrow.sniptaleArrowPointsJson);
  if (serializedPoints) {
    return serializedPoints;
  }

  const start = {
    x: arrow.sniptaleArrowStartX ?? 0,
    y: arrow.sniptaleArrowStartY ?? 0,
  };
  const end = {
    x: arrow.sniptaleArrowEndX ?? start.x,
    y: arrow.sniptaleArrowEndY ?? start.y,
  };
  const control =
    typeof arrow.sniptaleArrowControlX === 'number' &&
    typeof arrow.sniptaleArrowControlY === 'number'
      ? { x: arrow.sniptaleArrowControlX, y: arrow.sniptaleArrowControlY }
      : null;

  return control ? [start, control, end] : [start, end];
}

export function readArrowGeometry(arrow: ArrowPathInstance): {
  start: PointLike;
  end: PointLike;
  control: PointLike | null;
} {
  const points = readArrowPoints(arrow);
  const start = points[0] ?? { x: 0, y: 0 };
  const end = points[points.length - 1] ?? start;
  const control = points.length > 2 ? (points[1] ?? null) : null;

  return {
    start: clonePoint(start),
    end: clonePoint(end),
    control: control ? clonePoint(control) : null,
  };
}
