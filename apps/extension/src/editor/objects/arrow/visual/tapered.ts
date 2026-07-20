import type { EditorArrowSettings } from '../../../../features/editor/document/types';
import type { PointLike } from '../types';
import { buildRoundedClosedPath } from './rounded-path/build';
import { buildTaperedArrowOutline } from './tapered-outline';

function getDistance(from: PointLike, to: PointLike): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function getMidpoint(first: PointLike, second: PointLike): PointLike {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function resolveTaperedHeadCornerRadii(points: readonly PointLike[]): ReadonlyMap<number, number> {
  const tipIndex = Math.floor(points.length / 2);
  const upperShoulderIndex = tipIndex - 1;
  const lowerShoulderIndex = tipIndex + 1;
  const upperShoulder = points[upperShoulderIndex];
  const lowerShoulder = points[lowerShoulderIndex];
  const tip = points[tipIndex];
  if (!upperShoulder || !lowerShoulder || !tip) {
    return new Map();
  }

  const headSpan = getDistance(upperShoulder, lowerShoulder);
  const headLength = getDistance(getMidpoint(upperShoulder, lowerShoulder), tip);
  const radius = Math.max(1, Math.min(headSpan * 0.18, headLength * 0.22));

  return new Map([
    [upperShoulderIndex, radius],
    [tipIndex, radius],
    [lowerShoulderIndex, radius],
  ]);
}

export function buildTaperedArrowPathData(
  points: readonly PointLike[],
  settings: EditorArrowSettings
): string {
  const outline = buildTaperedArrowOutline(points, settings);
  return buildRoundedClosedPath(outline, { cornerRadii: resolveTaperedHeadCornerRadii(outline) });
}
