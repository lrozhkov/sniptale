import { measureAngleBetweenVectors, measureDistance } from '../metrics';
import type { FreehandPointRecord } from '../points';

export function measureSegmentAngle(start: FreehandPointRecord, end: FreehandPointRecord): number {
  return Math.atan2(end.y - start.y, end.x - start.x);
}

function normalizeHalfTurn(angle: number): number {
  const halfTurn = Math.PI;
  return ((angle % halfTurn) + halfTurn) % halfTurn;
}

export function measureHalfTurnDelta(left: number, right: number): number {
  const difference = Math.abs(normalizeHalfTurn(left) - normalizeHalfTurn(right));
  return Math.min(difference, Math.PI - difference);
}

export function measureInteriorAngle(
  previous: FreehandPointRecord,
  current: FreehandPointRecord,
  next: FreehandPointRecord
): number {
  const leftVector = {
    x: previous.x - current.x,
    y: previous.y - current.y,
  };
  const rightVector = {
    x: next.x - current.x,
    y: next.y - current.y,
  };
  return measureAngleBetweenVectors(leftVector, rightVector);
}

export function resolveRectangleRotation(corners: readonly FreehandPointRecord[]): number {
  const edges = corners.map((corner, index) => ({
    angle: measureSegmentAngle(corner, corners[(index + 1) % corners.length]!),
    length: measureDistance(corner, corners[(index + 1) % corners.length]!),
  }));
  const longestEdge = edges.reduce(
    (best, edge) => (edge.length > best.length ? edge : best),
    edges[0]!
  );
  return longestEdge.angle;
}
