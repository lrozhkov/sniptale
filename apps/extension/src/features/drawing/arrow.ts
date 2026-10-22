import { MAX_DRAWING_ARROW_BENDS, type DrawingArrowObject, type DrawingPoint } from './model';

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

type ShaftSample = { point: DrawingPoint; span: number };
const shaftCache = new WeakMap<DrawingArrowObject, readonly ShaftSample[]>();

function sampleArrowShaft(object: DrawingArrowObject): readonly ShaftSample[] {
  const cached = shaftCache.get(object);
  if (cached) return cached;
  const bends = object.design === 'freehand' ? (object.bendPoints ?? []) : [];
  if (bends.length === 0) {
    return [
      { point: object.start, span: 0 },
      { point: object.end, span: 0 },
    ];
  }
  const anchors = [object.start, ...bends, object.end];
  const samples: ShaftSample[] = [{ point: object.start, span: 0 }];
  for (let span = 0; span < anchors.length - 1; span += 1) {
    const start = anchors[span]!;
    const end = anchors[span + 1]!;
    const previous = anchors[span - 1] ?? start;
    const next = anchors[span + 2] ?? end;
    for (let step = 1; step <= 24; step += 1) {
      const progress = step / 24;
      const square = progress * progress;
      const cube = square * progress;
      const interpolate = (axis: 'x' | 'y') =>
        0.5 *
        (2 * start[axis] +
          (-previous[axis] + end[axis]) * progress +
          (2 * previous[axis] - 5 * start[axis] + 4 * end[axis] - next[axis]) * square +
          (-previous[axis] + 3 * start[axis] - 3 * end[axis] + next[axis]) * cube);
      samples.push({
        point: step === 24 ? end : { x: interpolate('x'), y: interpolate('y') },
        span,
      });
    }
  }
  shaftCache.set(object, samples);
  return samples;
}

export type DrawingArrowBendTarget = {
  readonly point: DrawingPoint;
  readonly index: number;
  readonly insert: boolean;
};

/** Finds an existing bend or a new insertion point on the shaft, never inside its empty bounds. */
export function resolveDrawingArrowBendTarget(
  object: DrawingArrowObject,
  point: DrawingPoint,
  tolerance = 9
): DrawingArrowBendTarget | null {
  if (object.design !== 'freehand') return null;
  const bends = object.bendPoints ?? [];
  const existing = bends.findIndex(
    (bend) => Math.hypot(point.x - bend.x, point.y - bend.y) <= tolerance
  );
  if (existing >= 0) return { point: bends[existing]!, index: existing, insert: false };
  if (bends.length >= MAX_DRAWING_ARROW_BENDS) return null;
  if ([object.start, object.end].some((end) => Math.hypot(point.x - end.x, point.y - end.y) <= 16))
    return null;
  const samples = sampleArrowShaft(object);
  let nearest: DrawingArrowBendTarget | null = null;
  let distance = tolerance;
  for (let index = 1; index < samples.length; index += 1) {
    const start = samples[index - 1]!.point;
    const end = samples[index]!.point;
    const delta = { x: end.x - start.x, y: end.y - start.y };
    const square = delta.x * delta.x + delta.y * delta.y;
    const ratio =
      square === 0
        ? 0
        : Math.max(
            0,
            Math.min(1, ((point.x - start.x) * delta.x + (point.y - start.y) * delta.y) / square)
          );
    const projected = { x: start.x + ratio * delta.x, y: start.y + ratio * delta.y };
    const candidateDistance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (candidateDistance <= distance) {
      distance = candidateDistance;
      nearest = { point: projected, index: samples[index]!.span, insert: true };
    }
  }
  return nearest;
}

/** Returns a new authored arrow without mutating its previous history entry. */
export function updateDrawingArrowBend(
  object: DrawingArrowObject,
  target: DrawingArrowBendTarget,
  point: DrawingPoint
): DrawingArrowObject {
  if (object.design !== 'freehand') return object;
  const bends = [...(object.bendPoints ?? [])];
  if (target.insert) {
    if (bends.length >= MAX_DRAWING_ARROW_BENDS || target.index < 0 || target.index > bends.length)
      return object;
    bends.splice(target.index, 0, point);
  } else {
    if (!bends[target.index]) return object;
    bends[target.index] = point;
  }
  return { ...object, bendPoints: bends };
}

/** Builds the ideal open-arrow geometry used for bounds, hit testing, and sketch rendering. */
export function buildDrawingFreehandArrowLines(object: DrawingArrowObject): DrawingPoint[][] {
  const shaft = sampleArrowShaft(object).map((sample) => sample.point);
  let length = 0;
  let direction = { x: 0, y: 0 };
  for (let index = 1; index < shaft.length; index += 1) {
    const previous = shaft[index - 1]!;
    const current = shaft[index]!;
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const distance = Math.hypot(dx, dy);
    length += distance;
    if (distance > 0) direction = { x: dx / distance, y: dy / distance };
  }
  if (length === 0) return [shaft];

  const tangent = direction;
  const normal = { x: -tangent.y, y: tangent.x };
  const headLength = Math.min(length * 0.38, Math.max(14, object.width * 2.2));
  const headHalf = headLength * 0.52;
  const leftWing = offsetPoint(object.end, tangent, normal, -headLength, headHalf);
  const rightWing = offsetPoint(object.end, tangent, normal, -headLength, -headHalf);
  return [shaft, [leftWing, object.end], [object.end, rightWing]];
}
