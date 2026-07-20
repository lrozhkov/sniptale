import type { PointLike } from '../types';
import { clonePoint, isPointLike } from './points';

export function serializeArrowPoints(points: PointLike[]): string {
  return JSON.stringify(points.map((point) => ({ x: point.x, y: point.y })));
}

export function parseArrowPointsJson(raw: unknown): PointLike[] | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const points = parsed.filter(isPointLike).map(clonePoint);
    return points.length >= 2 ? points : null;
  } catch {
    return null;
  }
}
