import type { PointLike } from '../types';
import { ELBOW_COLLINEAR_THRESHOLD, ELBOW_DEDUP_THRESHOLD } from './constants';
import type { Axis } from './types';

export function clonePoint(point: PointLike): PointLike {
  return { x: point.x, y: point.y };
}

export function isNear(valueA: number, valueB: number): boolean {
  return Math.abs(valueA - valueB) <= ELBOW_DEDUP_THRESHOLD;
}

function isCollinearNear(valueA: number, valueB: number): boolean {
  return Math.abs(valueA - valueB) <= ELBOW_COLLINEAR_THRESHOLD;
}

export function getTerminalAxis(start: PointLike, end: PointLike): Axis {
  const deltaX = Math.abs(end.x - start.x);
  const deltaY = Math.abs(end.y - start.y);
  return deltaX >= deltaY ? 'horizontal' : 'vertical';
}

export function getDistance(pointA: PointLike, pointB: PointLike): number {
  return Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
}

export function areCollinear(pointA: PointLike, pointB: PointLike, pointC: PointLike): boolean {
  return (
    (isCollinearNear(pointA.x, pointB.x) && isCollinearNear(pointB.x, pointC.x)) ||
    (isCollinearNear(pointA.y, pointB.y) && isCollinearNear(pointB.y, pointC.y))
  );
}
