import type { PointLike } from '../types';
import { getSegmentLength } from './outline-geometry';

function clonePolyline(points: readonly PointLike[]): PointLike[] {
  return points.map((point) => ({ ...point }));
}

function trimPolylineEdge(
  points: readonly PointLike[],
  amount: number,
  edge: 'end' | 'start'
): PointLike[] {
  const trimmed = clonePolyline(points);
  if (trimmed.length < 2 || amount <= 0) {
    return trimmed;
  }

  let remaining = amount;
  while (trimmed.length >= 2 && remaining > 0) {
    const startIndex = edge === 'start' ? 0 : trimmed.length - 2;
    const endIndex = edge === 'start' ? 1 : trimmed.length - 1;
    const start = trimmed[startIndex];
    const next = trimmed[endIndex];
    if (!start || !next) {
      break;
    }

    const segmentLength = getSegmentLength(start, next);
    if (segmentLength === 0) {
      void (edge === 'start' ? trimmed.shift() : trimmed.pop());
      continue;
    }

    if (remaining < segmentLength) {
      const ratio = edge === 'start' ? remaining / segmentLength : 1 - remaining / segmentLength;
      trimmed[edge === 'start' ? 0 : trimmed.length - 1] = {
        x: start.x + (next.x - start.x) * ratio,
        y: start.y + (next.y - start.y) * ratio,
      };
      return trimmed;
    }

    remaining -= segmentLength;
    void (edge === 'start' ? trimmed.shift() : trimmed.pop());
  }

  const anchor =
    edge === 'start'
      ? (trimmed[0] ?? points[points.length - 1] ?? { x: 0, y: 0 })
      : (trimmed[trimmed.length - 1] ?? points[0] ?? { x: 0, y: 0 });
  return [{ ...anchor }, { ...anchor }];
}

export function trimPolyline(
  points: readonly PointLike[],
  startAmount: number,
  endAmount: number
): PointLike[] {
  return trimPolylineEdge(trimPolylineEdge(points, startAmount, 'start'), endAmount, 'end');
}
