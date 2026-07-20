import type { PointLike } from '../../types';

export function getArrowCenterlineAngle(from: PointLike, to: PointLike): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function* iterateEdgePairs(points: readonly PointLike[], fromEnd: boolean) {
  if (fromEnd) {
    for (let index = points.length - 1; index > 0; index -= 1) {
      yield [points[index - 1], points[index]] as const;
    }
    return;
  }

  for (let index = 1; index < points.length; index += 1) {
    yield [points[index - 1], points[index]] as const;
  }
}

export function getFirstNonZeroEdgeAngle(points: readonly PointLike[], fromEnd: boolean): number {
  for (const [previous, current] of iterateEdgePairs(points, fromEnd)) {
    if (!current || !previous) {
      continue;
    }

    if (current.x !== previous.x || current.y !== previous.y) {
      return getArrowCenterlineAngle(previous, current);
    }
  }

  return 0;
}
