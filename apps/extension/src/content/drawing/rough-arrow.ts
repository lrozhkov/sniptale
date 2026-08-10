import rough from 'roughjs';
import type { Drawable, Op } from 'roughjs/bin/core';
import { buildDrawingFreehandArrowLines, type DrawingObject } from '../../features/drawing/public';

type DrawingArrowObject = Extract<DrawingObject, { kind: 'arrow' }>;
type DrawingViewportProjection = Readonly<{ x: number; y: number }>;

const ROUGH_GENERATOR = rough.generator();
const roughArrowCache = new WeakMap<DrawingArrowObject, readonly Drawable[]>();

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 1;
}

function buildRoughArrow(object: DrawingArrowObject): readonly Drawable[] {
  const cached = roughArrowCache.get(object);
  if (cached) return cached;

  const strokeWidth = Math.max(2, object.width * 0.34);
  const seed = hashSeed(object.id);
  const drawables = buildDrawingFreehandArrowLines(object).flatMap((line, index) => {
    const [start, end] = line;
    if (!start || !end) return [];
    return [
      ROUGH_GENERATOR.line(start.x, start.y, end.x, end.y, {
        bowing: 0.7,
        preserveVertices: true,
        roughness: 0.8,
        seed: seed + index,
        stroke: object.color,
        strokeWidth,
      }),
    ];
  });
  roughArrowCache.set(object, drawables);
  return drawables;
}

function applyRoughOperation(
  context: CanvasRenderingContext2D,
  operation: Op,
  projection: DrawingViewportProjection
): void {
  const data = operation.data;
  if (operation.op === 'move') {
    context.moveTo((data[0] ?? 0) - projection.x, (data[1] ?? 0) - projection.y);
  } else if (operation.op === 'lineTo') {
    context.lineTo((data[0] ?? 0) - projection.x, (data[1] ?? 0) - projection.y);
  } else {
    context.bezierCurveTo(
      (data[0] ?? 0) - projection.x,
      (data[1] ?? 0) - projection.y,
      (data[2] ?? 0) - projection.x,
      (data[3] ?? 0) - projection.y,
      (data[4] ?? 0) - projection.x,
      (data[5] ?? 0) - projection.y
    );
  }
}

export function drawRoughArrow(
  context: CanvasRenderingContext2D,
  object: DrawingArrowObject,
  projection: DrawingViewportProjection
): void {
  context.strokeStyle = object.color;
  context.lineWidth = Math.max(2, object.width * 0.34);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  buildRoughArrow(object).forEach((drawable) => {
    drawable.sets.forEach((set) => {
      if (set.type !== 'path') return;
      context.beginPath();
      set.ops.forEach((operation) => applyRoughOperation(context, operation, projection));
      context.stroke();
    });
  });
}
