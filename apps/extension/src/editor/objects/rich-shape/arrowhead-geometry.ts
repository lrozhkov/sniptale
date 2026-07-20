import type { RichShapePoint as Point } from './render-primitives';

interface RichShapeArrowheadPoints {
  baseA: Point;
  baseB: Point;
  tip: Point;
}

export function getArrowheadPoints(
  tip: Point,
  from: Point,
  strokeWidth: number
): RichShapeArrowheadPoints {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
  const size = Math.max(10, strokeWidth * 3.5);
  const back = { x: tip.x - Math.cos(angle) * size, y: tip.y - Math.sin(angle) * size };
  const normal = { x: Math.cos(angle + Math.PI / 2), y: Math.sin(angle + Math.PI / 2) };

  return {
    baseA: { x: back.x + normal.x * (size * 0.42), y: back.y + normal.y * (size * 0.42) },
    baseB: { x: back.x - normal.x * (size * 0.42), y: back.y - normal.y * (size * 0.42) },
    tip,
  };
}

export function getDiamondArrowheadPoints(points: RichShapeArrowheadPoints) {
  const center = {
    x: (points.baseA.x + points.baseB.x) / 2,
    y: (points.baseA.y + points.baseB.y) / 2,
  };
  const tail = {
    x: center.x + (center.x - points.tip.x),
    y: center.y + (center.y - points.tip.y),
  };
  return [points.tip, points.baseA, tail, points.baseB];
}
