import type { PointLike } from '../../types';
import { getPointDistance, moveTowardPoint } from './geometry';

export type RoundedCornerOptions = {
  cornerRadii?: ReadonlyMap<number, number>;
  radius?: number;
  roundedIndexes?: ReadonlySet<number>;
};

export function resolveRoundedEntry(
  points: readonly PointLike[],
  radius: number | null,
  index: number
) {
  const count = points.length;
  const point = points[index];
  if (!point) {
    return null;
  }

  if (radius === null || radius <= 0) {
    return createPlainEntry(point);
  }

  const previous = points[(index - 1 + count) % count];
  const next = points[(index + 1) % count];
  if (!previous || !next) {
    return createPlainEntry(point);
  }

  const maxRadius =
    Math.min(getPointDistance(previous, point), getPointDistance(point, next)) * 0.35;
  const clampedRadius = Math.min(radius, maxRadius);
  if (clampedRadius <= 0) {
    return createPlainEntry(point);
  }

  return {
    incoming: moveTowardPoint(point, previous, clampedRadius),
    outgoing: moveTowardPoint(point, next, clampedRadius),
    point,
    radius: clampedRadius,
  };
}

export function resolveCornerRadius(options: RoundedCornerOptions, index: number): number | null {
  const mappedRadius = options.cornerRadii?.get(index);
  if (typeof mappedRadius === 'number') {
    return mappedRadius;
  }

  if (options.roundedIndexes?.has(index)) {
    return options.radius ?? null;
  }

  return null;
}

function createPlainEntry(point: PointLike) {
  return {
    incoming: point,
    outgoing: point,
    point,
    radius: null,
  };
}
