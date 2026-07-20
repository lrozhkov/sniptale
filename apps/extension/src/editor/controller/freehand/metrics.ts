import type { FreehandPointRecord } from './points';

export type Bounds = {
  bottom?: number;
  height: number;
  left?: number;
  right?: number;
  top?: number;
  width: number;
};

export function measureDistance(left: FreehandPointRecord, right: FreehandPointRecord): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function measureCoordinateBounds(points: readonly FreehandPointRecord[]): Required<Bounds> {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  };
}

export function measureBounds(points: readonly FreehandPointRecord[]): Bounds {
  return measureCoordinateBounds(points);
}

export function measureAngleBetweenVectors(
  leftVector: FreehandPointRecord,
  rightVector: FreehandPointRecord
): number {
  const leftLength = Math.hypot(leftVector.x, leftVector.y);
  const rightLength = Math.hypot(rightVector.x, rightVector.y);
  if (leftLength === 0 || rightLength === 0) {
    return 0;
  }

  const cosine =
    (leftVector.x * rightVector.x + leftVector.y * rightVector.y) / (leftLength * rightLength);
  return Math.acos(Math.max(-1, Math.min(1, cosine)));
}

export function measurePathLength(points: readonly FreehandPointRecord[]): number {
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (!previous || !current) {
      continue;
    }

    total += measureDistance(previous, current);
  }

  return total;
}
