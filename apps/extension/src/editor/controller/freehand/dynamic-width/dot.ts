import type { Path } from 'fabric';
import type { DynamicStrokePoint } from './types';

type FreehandPathCommand = NonNullable<Path['path']>[number];

const DOT_SEGMENT_COUNT = 20;
const MIN_DOT_RADIUS = 0.5;

function measureStrokeLength(points: readonly DynamicStrokePoint[]): number {
  return points.reduce((sum, point, index) => {
    const previous = points[index - 1];
    return previous ? sum + Math.hypot(point.x - previous.x, point.y - previous.y) : sum;
  }, 0);
}

function resolveDotCenter(points: readonly DynamicStrokePoint[]) {
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: total.x / points.length, y: total.y / points.length };
}

function resolveDotRadius(points: readonly DynamicStrokePoint[]): number {
  const width = points.reduce((maxWidth, point) => Math.max(maxWidth, point.width), 0);
  return Math.max(MIN_DOT_RADIUS, width / 2);
}

export function shouldRenderDynamicDot(
  points: readonly DynamicStrokePoint[],
  width: number
): boolean {
  if (points.length < 2) {
    return points.length === 1;
  }

  return measureStrokeLength(points) <= Math.max(1, width * 0.2);
}

export function buildDynamicDotPath(points: readonly DynamicStrokePoint[]): Path['path'] | null {
  const firstPoint = points[0];
  if (!firstPoint) {
    return null;
  }

  const center = resolveDotCenter(points);
  const radius = resolveDotRadius(points);
  const commands: FreehandPathCommand[] = [['M', center.x + radius, center.y]];
  for (let index = 1; index < DOT_SEGMENT_COUNT; index += 1) {
    const angle = (Math.PI * 2 * index) / DOT_SEGMENT_COUNT;
    commands.push(['L', center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius]);
  }
  commands.push(['Z']);
  return commands;
}
