import type { PointLike } from '../types';
import { buildOrientedPolygon, buildOrientedRect } from './heads-geometry';
import { circleToPath } from './points';

export function buildTriangleOutlinePath(
  vertices: readonly PointLike[],
  point: PointLike,
  angleRad: number,
  width: number
): string {
  return buildOutlinePolygon(vertices, point, angleRad, Math.max(2, width * 0.48));
}

export function buildDiamondOutlinePath(
  vertices: readonly PointLike[],
  point: PointLike,
  angleRad: number,
  width: number
): string {
  return buildOutlinePolygon(vertices, point, angleRad, Math.max(2, width * 0.48));
}

export function buildCircleOutlinePath(
  point: PointLike,
  radius: number,
  thickness: number
): string {
  return `${circleToPath(point, radius)} ${circleToReversePath(point, Math.max(1, radius - thickness))}`;
}

export function buildCrosshairCirclePath(
  point: PointLike,
  angleRad: number,
  radius: number,
  width: number
): string {
  const thickness = Math.max(1.8, width * 0.36);
  return [
    buildCircleOutlinePath(point, radius, Math.max(2, width * 0.5)),
    buildOrientedRect(point, radius * 1.2, thickness / 2, angleRad),
    buildOrientedRect(point, radius * 1.2, thickness / 2, angleRad + Math.PI / 2),
  ].join(' ');
}

function buildOutlinePolygon(
  vertices: readonly PointLike[],
  point: PointLike,
  angleRad: number,
  thickness: number
): string {
  const center = getPolygonCenter(vertices);
  const scale = Math.max(0.2, 1 - thickness / Math.max(1, getPolygonRadius(vertices)));
  const inner = vertices
    .map((vertex) => ({
      x: center.x + (vertex.x - center.x) * scale,
      y: center.y + (vertex.y - center.y) * scale,
    }))
    .reverse();
  return `${buildOrientedPolygon(vertices, point, angleRad)} ${buildOrientedPolygon(
    inner,
    point,
    angleRad
  )}`;
}

function getPolygonRadius(vertices: readonly PointLike[]): number {
  return Math.max(...vertices.map((vertex) => Math.hypot(vertex.x, vertex.y)));
}

function getPolygonCenter(vertices: readonly PointLike[]): PointLike {
  if (vertices.length === 0) {
    return { x: 0, y: 0 };
  }

  const total = vertices.reduce(
    (sum, vertex) => ({
      x: sum.x + vertex.x,
      y: sum.y + vertex.y,
    }),
    { x: 0, y: 0 }
  );
  return {
    x: total.x / vertices.length,
    y: total.y / vertices.length,
  };
}

function circleToReversePath(center: PointLike, radius: number): string {
  return [
    `M ${center.x + radius} ${center.y}`,
    `A ${radius} ${radius} 0 1 1 ${center.x - radius} ${center.y}`,
    `A ${radius} ${radius} 0 1 1 ${center.x + radius} ${center.y}`,
    'Z',
  ].join(' ');
}
