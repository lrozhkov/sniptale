import type { PointLike } from '../types';

export function clonePoint(point: PointLike): PointLike {
  return { x: point.x, y: point.y };
}

export function isPointLike(value: unknown): value is PointLike {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PointLike>;
  return (
    typeof candidate.x === 'number' &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.y)
  );
}
