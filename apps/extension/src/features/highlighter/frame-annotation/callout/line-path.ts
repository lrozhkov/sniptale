import type { CalloutConnectorCornerStyle } from '@sniptale/runtime-contracts/highlighter/callout';

type Point = { x: number; y: number };

function createPath(points: Point[], left: number, top: number): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x - left} ${point.y - top}`)
    .join(' ');
}

function getPointAlong(from: Point, to: Point, distance: number): Point {
  const segmentLength = Math.hypot(to.x - from.x, to.y - from.y);
  if (segmentLength <= 0) return from;
  const ratio = Math.min(1, distance / segmentLength);
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  };
}

export function createRoundedConnectorPath(
  points: Point[],
  left: number,
  top: number,
  cornerStyle: CalloutConnectorCornerStyle
) {
  if (cornerStyle.kind === 'sharp' || cornerStyle.radius <= 0 || points.length < 3) {
    return createPath(points, left, top);
  }
  const first = points[0]!;
  let path = `M ${first.x - left} ${first.y - top}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const corner = points[index]!;
    const next = points[index + 1]!;
    const radius = Math.min(
      cornerStyle.radius,
      Math.hypot(corner.x - previous.x, corner.y - previous.y) / 2,
      Math.hypot(next.x - corner.x, next.y - corner.y) / 2
    );
    const entry = getPointAlong(corner, previous, radius);
    const exit = getPointAlong(corner, next, radius);
    path += ` L ${entry.x - left} ${entry.y - top}`;
    path += ` Q ${corner.x - left} ${corner.y - top} ${exit.x - left} ${exit.y - top}`;
  }
  const last = points.at(-1)!;
  return `${path} L ${last.x - left} ${last.y - top}`;
}
