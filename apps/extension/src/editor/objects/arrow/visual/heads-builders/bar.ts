import type { PointLike } from '../../types';
import { buildOrientedRect } from '../heads-geometry';
import { getBarArrowHeadLength } from '../heads-metrics';

const BAR_HEAD_HALF_MULTIPLIER = 2.4;

export function buildBarArrowHeadPath(
  point: PointLike,
  angleRad: number,
  width: number,
  size?: number
): string {
  return buildOrientedRect(
    point,
    getBarArrowHeadLength(width, size),
    Math.max(8, width * BAR_HEAD_HALF_MULTIPLIER),
    angleRad
  );
}
