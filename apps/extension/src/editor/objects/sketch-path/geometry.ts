import type { SketchPoint } from './types';

export function getSketchSegmentLength(start: SketchPoint, end: SketchPoint): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function getSketchSegmentNormal(start: SketchPoint, end: SketchPoint): SketchPoint {
  const length = getSketchSegmentLength(start, end);
  if (length <= 0.0001) {
    return { x: 0, y: -1 };
  }

  return {
    x: -(end.y - start.y) / length,
    y: (end.x - start.x) / length,
  };
}

export function getQuadraticSketchPoint(
  start: SketchPoint,
  control: SketchPoint,
  end: SketchPoint,
  ratio: number
): SketchPoint {
  const inverse = 1 - ratio;
  return {
    x: inverse * inverse * start.x + 2 * inverse * ratio * control.x + ratio * ratio * end.x,
    y: inverse * inverse * start.y + 2 * inverse * ratio * control.y + ratio * ratio * end.y,
  };
}

export function interpolateSketchPoint(
  start: SketchPoint,
  end: SketchPoint,
  ratio: number
): SketchPoint {
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  };
}
