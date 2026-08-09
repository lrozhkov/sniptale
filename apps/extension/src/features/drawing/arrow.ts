import type { DrawingArrowObject, DrawingPoint } from './model';

const EDITOR_DYNAMIC_TAIL_RATIO = 0.38;
const EDITOR_DYNAMIC_END_RATIO = 1.28;
const EDITOR_HEAD_SIZE_MULTIPLIER = 3.4;
const EDITOR_HEAD_ANGLE = (25 * Math.PI) / 180;

function offsetPoint(
  origin: DrawingPoint,
  tangent: DrawingPoint,
  normal: DrawingPoint,
  distance: number,
  offset: number
): DrawingPoint {
  return {
    x: origin.x + tangent.x * distance + normal.x * offset,
    y: origin.y + tangent.y * distance + normal.y * offset,
  };
}

/**
 * Builds the straight filled-arrow profile used by Drawing. Its width progression and triangle
 * head metrics mirror the image editor's dynamic-width arrow geometry without importing Fabric.
 */
export function buildDrawingArrowOutline(object: DrawingArrowObject): DrawingPoint[] {
  const dx = object.end.x - object.start.x;
  const dy = object.end.y - object.start.y;
  const length = Math.hypot(dx, dy);
  const width = Math.max(1, object.width);
  if (length === 0) {
    const half = width / 2;
    return [
      { x: object.start.x - half, y: object.start.y },
      { x: object.start.x, y: object.start.y - half },
      { x: object.start.x + half, y: object.start.y },
      { x: object.start.x, y: object.start.y + half },
    ];
  }

  const tangent = { x: dx / length, y: dy / length };
  const normal = { x: -tangent.y, y: tangent.x };
  const baseHalf = width / 2;
  const tailHalf = object.dynamicWidth
    ? Math.max(0.75, baseHalf * EDITOR_DYNAMIC_TAIL_RATIO)
    : Math.max(1, baseHalf);
  const shaftEndHalf = object.dynamicWidth
    ? Math.max(0.75, baseHalf * EDITOR_DYNAMIC_END_RATIO)
    : Math.max(1, baseHalf);
  const headSize = Math.max(10, width * EDITOR_HEAD_SIZE_MULTIPLIER);
  const headDepth = Math.min(Math.cos(EDITOR_HEAD_ANGLE) * headSize, length * 0.72);
  const headHalf = Math.min(Math.sin(EDITOR_HEAD_ANGLE) * headSize, Math.max(width, headDepth));
  const headBaseDistance = Math.max(0, length - headDepth);
  const overlap = Math.min(3, Math.max(1, width * 0.08));
  const shaftEndDistance = Math.min(length, headBaseDistance + overlap);

  return [
    offsetPoint(object.start, tangent, normal, 0, tailHalf),
    offsetPoint(object.start, tangent, normal, shaftEndDistance, shaftEndHalf),
    offsetPoint(object.start, tangent, normal, headBaseDistance, headHalf),
    object.end,
    offsetPoint(object.start, tangent, normal, headBaseDistance, -headHalf),
    offsetPoint(object.start, tangent, normal, shaftEndDistance, -shaftEndHalf),
    offsetPoint(object.start, tangent, normal, 0, -tailHalf),
  ];
}
