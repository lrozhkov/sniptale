import { measureDistance } from '../metrics';
import type { FreehandPointRecord } from '../points';

function measureDistanceToSegment(
  point: FreehandPointRecord,
  start: FreehandPointRecord,
  end: FreehandPointRecord
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return measureDistance(point, start);
  }

  const ratio = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx ** 2 + dy ** 2))
  );
  return measureDistance(point, {
    x: start.x + dx * ratio,
    y: start.y + dy * ratio,
  });
}

export function measurePolylineError(
  points: readonly FreehandPointRecord[],
  outline: readonly FreehandPointRecord[]
): number {
  if (points.length === 0 || outline.length < 2) {
    return Number.POSITIVE_INFINITY;
  }

  return (
    points.reduce((total, point) => {
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let index = 1; index < outline.length; index += 1) {
        nearestDistance = Math.min(
          nearestDistance,
          measureDistanceToSegment(point, outline[index - 1]!, outline[index]!)
        );
      }

      return total + nearestDistance;
    }, 0) / points.length
  );
}
