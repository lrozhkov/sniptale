import { clamp, cubicBezierYForX, ease, resolveTimelineEase } from './timeline/easing.js';

export { clamp, cubicBezierYForX, ease, resolveTimelineEase };

export function deterministicRandom(seed: unknown): number {
  if (seed == null) {
    return 0.986326;
  }
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000000) / 1000000;
}

export function interpolatePoints(
  value: number,
  points: unknown,
  values: unknown,
  easingName: string
): unknown {
  const sourcePoints = Array.isArray(points) ? points.map(Number) : [];
  const sourceValues: unknown[] = Array.isArray(values) ? values : [];
  if (sourcePoints.length === 0 || sourceValues.length === 0) {
    return null;
  }
  if (value <= sourcePoints[0]!) {
    return sourceValues[0];
  }
  for (let index = 0; index < sourcePoints.length - 1; index += 1) {
    if (value <= sourcePoints[index + 1]!) {
      const t = ease(easingName, segment(value, sourcePoints[index]!, sourcePoints[index + 1]!));
      return interpolateTimelineValue(sourceValues[index], sourceValues[index + 1], t);
    }
  }
  return sourceValues[sourceValues.length - 1];
}

export function interpolateTimelineValue(from: unknown, to: unknown, t: number): unknown {
  if (typeof from === 'number' && typeof to === 'number') {
    return lerp(from, to, t);
  }
  if (Array.isArray(from) && Array.isArray(to) && from.length === to.length) {
    const sourceValues: unknown[] = from;
    const targetValues: unknown[] = to;
    return sourceValues.map((value, index) =>
      typeof value === 'number' && typeof targetValues[index] === 'number'
        ? lerp(value, targetValues[index], t)
        : t < 0.5
          ? value
          : targetValues[index]
    );
  }
  if (isPlainObject(from) && isPlainObject(to)) {
    const result = { ...from };
    for (const key of Object.keys(to)) {
      result[key] = interpolateTimelineValue(from[key], to[key], t);
    }
    return result;
  }
  return t < 0.5 ? from : to;
}

export function segment(value: number, start: number, end: number): number {
  if (value <= start) return 0;
  if (value >= end) return 1;
  return (value - start) / Math.max(0.0001, end - start);
}

export function roundRect(
  context: Pick<OffscreenCanvasRenderingContext2D, 'arcTo' | 'beginPath' | 'closePath' | 'moveTo'>,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
