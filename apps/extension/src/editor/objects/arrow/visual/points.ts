import type { PointLike } from '../types';

export function getFirstPoint(points: readonly PointLike[]): PointLike | null {
  return points[0] ?? null;
}

export function getLastPoint(points: readonly PointLike[]): PointLike | null {
  return points[points.length - 1] ?? null;
}

export function rotatePoint(point: PointLike, angleRad: number): PointLike {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

export function translatePoint(point: PointLike, offset: PointLike): PointLike {
  return {
    x: point.x + offset.x,
    y: point.y + offset.y,
  };
}

export function polygonToPath(points: readonly PointLike[]): string {
  const first = getFirstPoint(points);
  if (!first) {
    return '';
  }

  const rest = points.slice(1);
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(' ')} Z`;
}

export function circleToPath(center: PointLike, radius: number): string {
  return [
    `M ${center.x + radius} ${center.y}`,
    `A ${radius} ${radius} 0 1 0 ${center.x - radius} ${center.y}`,
    `A ${radius} ${radius} 0 1 0 ${center.x + radius} ${center.y}`,
    'Z',
  ].join(' ');
}
