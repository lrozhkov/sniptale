import type { LinePoint } from './types';

export function cloneLinePoint(point: LinePoint): LinePoint {
  return { x: point.x, y: point.y };
}

function isLinePoint(value: unknown): value is LinePoint {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<LinePoint>;
  return (
    typeof candidate.x === 'number' &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.y)
  );
}

export function normalizeLinePoints(points: readonly LinePoint[]): LinePoint[] {
  const sanitized = points.filter(isLinePoint).map(cloneLinePoint);
  if (sanitized.length >= 2) {
    return sanitized;
  }

  const fallback = sanitized[0] ?? { x: 0, y: 0 };
  return [cloneLinePoint(fallback), cloneLinePoint(fallback)];
}

export function serializeLinePoints(points: readonly LinePoint[]): string {
  return JSON.stringify(points.map((point) => ({ x: point.x, y: point.y })));
}

export function parseLinePointsJson(raw: unknown): LinePoint[] | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const points = normalizeLinePoints(parsed.filter(isLinePoint));
    return points.length >= 2 ? points : null;
  } catch {
    return null;
  }
}

export function distanceSquared(first: LinePoint, second: LinePoint): number {
  return (first.x - second.x) ** 2 + (first.y - second.y) ** 2;
}

export function shouldCloseLine(points: readonly LinePoint[], point: LinePoint, threshold = 14) {
  const first = points[0];
  return Boolean(first && points.length >= 3 && distanceSquared(first, point) <= threshold ** 2);
}
