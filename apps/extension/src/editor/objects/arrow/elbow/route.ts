import type { PointLike } from '../types';
import { clonePoint, getTerminalAxis, isNear } from './points';
import { simplifyElbowPoints } from './simplify';
import type { Axis } from './types';

function buildOrthogonalSegment(start: PointLike, end: PointLike, axis: Axis): PointLike[] {
  if (isNear(start.x, end.x) || isNear(start.y, end.y)) {
    return [clonePoint(start), clonePoint(end)];
  }

  if (axis === 'horizontal') {
    const middleX = start.x + (end.x - start.x) / 2;
    return [
      clonePoint(start),
      { x: middleX, y: start.y },
      { x: middleX, y: end.y },
      clonePoint(end),
    ];
  }

  const middleY = start.y + (end.y - start.y) / 2;
  return [clonePoint(start), { x: start.x, y: middleY }, { x: end.x, y: middleY }, clonePoint(end)];
}

function appendSegment(target: PointLike[], segment: PointLike[]): void {
  segment.forEach((point, index) => {
    if (index === 0 && target.length > 0) {
      return;
    }
    target.push(clonePoint(point));
  });
}

export function normalizeElbowPoints(points: PointLike[]): PointLike[] {
  if (points.length < 2) {
    return points.map(clonePoint);
  }

  const start = points[0];
  const end = points[points.length - 1];
  if (!start || !end) {
    return points.map(clonePoint);
  }

  const routed: PointLike[] = [];
  let previous = start;
  appendSegment(routed, [clonePoint(start)]);

  points.slice(1).forEach((targetPoint) => {
    const segment = buildOrthogonalSegment(
      previous,
      targetPoint,
      getTerminalAxis(previous, targetPoint)
    );
    appendSegment(routed, segment);
    previous = targetPoint;
  });

  return simplifyElbowPoints(routed);
}
