import type {
  CursorFocusKey,
  CursorFocusEvaluation,
  CursorFocusPoint,
  CursorFocusSegment,
} from './types';

const unit = (value: number) => Math.max(0, Math.min(1, value));
const curveKeys = new WeakMap<CursorFocusKey[], CursorFocusKey[]>();

/** A deliberate coincident override is the endpoint on both sides; facts retain their own identity. */
function effectiveCurveSegment(segment: CursorFocusSegment): CursorFocusSegment {
  let keys = curveKeys.get(segment.keys);
  if (!keys) {
    keys = [];
    for (const key of segment.keys) {
      if (keys.at(-1)?.time === key.time) keys[keys.length - 1] = key;
      else keys.push(key);
    }
    curveKeys.set(segment.keys, keys);
  }
  return keys.length === segment.keys.length ? segment : { ...segment, keys };
}

/** Deterministic bounded curve evaluation, shared by seek, preview and export. */
export function evaluateCursorFocusSegment(
  segment: CursorFocusSegment,
  time: number,
  smoothing = 0.5
): CursorFocusEvaluation | null {
  segment = effectiveCurveSegment(segment);
  if (time < segment.start || time > segment.end || !segment.keys.length) return null;
  let low = 0;
  let high = segment.keys.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (segment.keys[middle]!.time <= time) low = middle + 1;
    else high = middle;
  }
  const leftIndex = Math.max(0, low - 1);
  const left = segment.keys[leftIndex]!;
  const right = segment.keys[leftIndex + 1];
  if (!right || left.interpolation === 'hold' || time < left.time)
    return { x: left.x, y: left.y, segmentId: segment.id, constrained: false };
  const progress = unit((time - left.time) / (right.time - left.time));
  const one = 1 - progress;
  const incoming = keyControls(segment, leftIndex + 1, smoothing).incoming ?? right;
  const outgoing = keyControls(segment, leftIndex, smoothing).outgoing ?? left;
  const curved =
    (left.interpolation === 'smooth' && smoothing > 0) || left.outgoing || right.incoming;
  const point: CursorFocusPoint = curved
    ? {
        x:
          one ** 3 * left.x +
          3 * one ** 2 * progress * outgoing.x +
          3 * one * progress ** 2 * incoming.x +
          progress ** 3 * right.x,
        y:
          one ** 3 * left.y +
          3 * one ** 2 * progress * outgoing.y +
          3 * one * progress ** 2 * incoming.y +
          progress ** 3 * right.y,
      }
    : { x: left.x + (right.x - left.x) * progress, y: left.y + (right.y - left.y) * progress };
  return {
    x: unit(point.x),
    y: unit(point.y),
    segmentId: segment.id,
    constrained: point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1,
  };
}

function keyControls(segment: CursorFocusSegment, index: number, smoothing: number) {
  const key = segment.keys[index]!;
  const before = segment.keys[index - 1];
  const after = segment.keys[index + 1];
  const from = before ?? key;
  const to = after ?? key;
  const control = (duration: number, direction: number) => {
    const scale =
      key.anchor === 'dwell'
        ? 0
        : (((duration / Math.max(0.000001, duration, to.time - from.time)) * unit(smoothing)) / 3) *
          direction;
    return { x: unit(key.x + (to.x - from.x) * scale), y: unit(key.y + (to.y - from.y) * scale) };
  };
  return {
    incoming: key.incoming ?? (before ? control(key.time - before.time, -1) : undefined),
    outgoing: key.outgoing ?? (after ? control(after.time - key.time, 1) : undefined),
  };
}

/** Editor previews display automatic controls separately; only a deliberate edit persists them. */
export function cursorFocusKeyControls(segment: CursorFocusSegment, id: string, smoothing: number) {
  const effective = effectiveCurveSegment(segment);
  if (effective.keys.some((key) => key.id === id)) segment = effective;
  const index = segment.keys.findIndex((key) => key.id === id);
  return index >= 0
    ? keyControls(segment, index, smoothing)
    : { incoming: undefined, outgoing: undefined };
}
