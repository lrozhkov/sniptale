import { measureBounds } from './metrics';
import type { FreehandPointRecord } from './points';

type OrientedBounds = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

export function measureCentroid(points: readonly FreehandPointRecord[]): FreehandPointRecord {
  const total = points.reduce(
    (result, point) => ({
      x: result.x + point.x,
      y: result.y + point.y,
    }),
    { x: 0, y: 0 }
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  };
}

export function rotatePoint(
  point: FreehandPointRecord,
  center: FreehandPointRecord,
  angle: number
): FreehandPointRecord {
  const translatedX = point.x - center.x;
  const translatedY = point.y - center.y;
  return {
    x: center.x + translatedX * Math.cos(angle) - translatedY * Math.sin(angle),
    y: center.y + translatedX * Math.sin(angle) + translatedY * Math.cos(angle),
  };
}

export function measurePrincipalAxis(points: readonly FreehandPointRecord[]): number {
  const center = measureCentroid(points);
  const covariance = points.reduce(
    (result, point) => {
      const dx = point.x - center.x;
      const dy = point.y - center.y;
      return {
        xx: result.xx + dx * dx,
        xy: result.xy + dx * dy,
        yy: result.yy + dy * dy,
      };
    },
    { xx: 0, xy: 0, yy: 0 }
  );

  return 0.5 * Math.atan2(2 * covariance.xy, covariance.xx - covariance.yy);
}

export function measureOrientedBounds(
  points: readonly FreehandPointRecord[],
  center: FreehandPointRecord,
  rotation: number
): OrientedBounds {
  const rotated = points.map((point) => rotatePoint(point, center, -rotation));
  return measureBounds(rotated) as OrientedBounds;
}

export function orderVerticesClockwise(
  vertices: readonly FreehandPointRecord[]
): FreehandPointRecord[] {
  const center = measureCentroid(vertices);
  return [...vertices].sort(
    (left, right) =>
      Math.atan2(left.y - center.y, left.x - center.x) -
      Math.atan2(right.y - center.y, right.x - center.x)
  );
}

export function buildRectangleVertices(options: {
  center: FreehandPointRecord;
  height: number;
  rotation: number;
  width: number;
}): FreehandPointRecord[] {
  const { center, height, rotation, width } = options;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const corners = [
    { x: center.x - halfWidth, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y + halfHeight },
    { x: center.x - halfWidth, y: center.y + halfHeight },
  ];

  return corners.map((point) => rotatePoint(point, center, rotation));
}

export function buildDiamondVertices(options: {
  center: FreehandPointRecord;
  height: number;
  rotation: number;
  width: number;
}): FreehandPointRecord[] {
  const { center, height, rotation, width } = options;
  const vertices = [
    { x: center.x, y: center.y - height / 2 },
    { x: center.x + width / 2, y: center.y },
    { x: center.x, y: center.y + height / 2 },
    { x: center.x - width / 2, y: center.y },
  ];

  return vertices.map((point) => rotatePoint(point, center, rotation));
}
