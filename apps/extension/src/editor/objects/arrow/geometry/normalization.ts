import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import { normalizeElbowPoints } from '../elbow/route';
import type { PointLike } from '../types';
import { getEffectiveArrowMode } from '../variant';
import { clonePoint, isPointLike } from './points';

function buildCurveControl(start: PointLike, end: PointLike): PointLike {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  const lift = Math.max(24, distance * 0.2);
  return {
    x: start.x + dx / 2,
    y: start.y + dy / 2 - lift,
  };
}

function createCollapsedArrowPoints(): PointLike[] {
  return [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
}

export function normalizeArrowPoints(
  points: PointLike[],
  settings: EditorArrowSettings
): PointLike[] {
  const sanitized = points.filter(isPointLike).map(clonePoint);
  if (sanitized.length === 0) {
    return createCollapsedArrowPoints();
  }

  if (sanitized.length === 1) {
    const firstPoint = sanitized[0];
    if (!firstPoint) {
      return createCollapsedArrowPoints();
    }

    sanitized.push(clonePoint(firstPoint));
  }

  if (settings.arrowType === 'elbow') {
    return normalizeElbowPoints(sanitized);
  }

  if (getEffectiveArrowMode(settings) === 'curve' && sanitized.length < 3) {
    const start = sanitized[0];
    const end = sanitized[sanitized.length - 1];
    if (!start || !end) {
      return createCollapsedArrowPoints();
    }
    sanitized.splice(1, 0, buildCurveControl(start, end));
  }

  return sanitized;
}
