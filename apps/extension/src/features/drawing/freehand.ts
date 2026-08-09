import type { DrawingPoint, DrawingSample } from './model';

interface DynamicStrokePoint extends DrawingPoint {
  width: number;
}

const WIDTH_EASING = 0.24;
const MIN_WIDTH_RATIO = 0.34;
const SPEED_TO_THINNESS = 1.35;
const START_AVERAGE_DISTANCE_PX = 32;
const EDGE_WIDTH_DISTANCE_PX = 24;
const SMOOTHING_STEP_PX = 2;
const DEFAULT_SMOOTHING_WEIGHT = 0.25;
const SHARP_CORNER_SMOOTHING_WEIGHT = 0.08;
const DYNAMIC_WIDTH_MIN_SAMPLE_DISTANCE_PX = 2;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (start: DrawingPoint, end: DrawingPoint) =>
  Math.hypot(end.x - start.x, end.y - start.y);

export function appendDrawingSample(
  samples: readonly DrawingSample[],
  sample: DrawingSample,
  dynamicWidth: boolean
): DrawingSample[] {
  if (dynamicWidth && samples.length >= 2) {
    const previous = samples[samples.length - 2]!;
    const last = samples[samples.length - 1]!;
    if (
      distance(last, sample) < DYNAMIC_WIDTH_MIN_SAMPLE_DISTANCE_PX &&
      distance(previous, sample) < DYNAMIC_WIDTH_MIN_SAMPLE_DISTANCE_PX
    ) {
      return [...samples.slice(0, -1), sample];
    }
  }
  const last = samples[samples.length - 1];
  return last && last.x === sample.x && last.y === sample.y ? [...samples] : [...samples, sample];
}

function resolveSpeedRatios(samples: readonly DrawingSample[]): number[] {
  const ratios = samples.map((sample, index) => {
    const neighbor = samples[index - 1] ?? samples[index + 1];
    if (!neighbor) return 1;
    const elapsed = Math.max(1, Math.abs(sample.t - neighbor.t));
    return clamp(1 - distance(sample, neighbor) / elapsed / SPEED_TO_THINNESS, MIN_WIDTH_RATIO, 1);
  });
  return ratios.map(
    (ratio, index) =>
      (ratios[Math.max(0, index - 1)] ?? ratio) * 0.25 +
      ratio * 0.5 +
      (ratios[Math.min(ratios.length - 1, index + 1)] ?? ratio) * 0.25
  );
}

function resolveWarmStartRatios(samples: readonly DrawingSample[], ratios: readonly number[]) {
  let travelled = 0;
  let weighted = 0;
  let totalWeight = 0;
  const distances = samples.map((sample, index) => {
    const previous = samples[index - 1];
    if (previous) travelled += distance(previous, sample);
    if (travelled <= START_AVERAGE_DISTANCE_PX) {
      const weight = Math.max(1, travelled);
      weighted += (ratios[index] ?? 1) * weight;
      totalWeight += weight;
    }
    return travelled;
  });
  const warm = totalWeight > 0 ? weighted / totalWeight : (ratios[0] ?? 1);
  return ratios.map((ratio, index) => {
    const blend = clamp((distances[index] ?? 0) / START_AVERAGE_DISTANCE_PX, 0, 1);
    return warm * (1 - blend) + ratio * blend;
  });
}

function resolveDynamicPoints(samples: readonly DrawingSample[], width: number, dynamic: boolean) {
  const ratios = dynamic
    ? resolveWarmStartRatios(samples, resolveSpeedRatios(samples))
    : samples.map(() => 1);
  let previousWidth = width * (ratios[0] ?? 1);
  return samples.map((sample, index) => {
    const target = ratios[index] ?? 1;
    const nextWidth = dynamic
      ? previousWidth * (1 - WIDTH_EASING) + width * target * WIDTH_EASING
      : width;
    previousWidth = nextWidth;
    return { x: sample.x, y: sample.y, width: nextWidth };
  });
}

function interpolate(start: DynamicStrokePoint, end: DynamicStrokePoint, value: number) {
  const length = distance(start, end);
  const ratio = length <= 0 ? 0 : clamp(value / length, 0, 1);
  return {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
    width: start.width + (end.width - start.width) * ratio,
  };
}

function resample(points: readonly DynamicStrokePoint[]) {
  const first = points[0];
  if (!first || points.length < 2) return points.map((point) => ({ ...point }));
  const result: DynamicStrokePoint[] = [{ ...first }];
  let carry = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    const segment = distance(start, end);
    if (segment <= 0) continue;
    let nextDistance = SMOOTHING_STEP_PX - carry;
    while (nextDistance < segment) {
      result.push(interpolate(start, end, nextDistance));
      nextDistance += SMOOTHING_STEP_PX;
    }
    carry = segment - (nextDistance - SMOOTHING_STEP_PX);
  }
  const last = points[points.length - 1]!;
  const previous = result[result.length - 1];
  if (!previous || previous.x !== last.x || previous.y !== last.y) result.push({ ...last });
  return result;
}

function isSharp(previous: DrawingPoint, current: DrawingPoint, next: DrawingPoint) {
  const incoming = { x: previous.x - current.x, y: previous.y - current.y };
  const outgoing = { x: next.x - current.x, y: next.y - current.y };
  const lengths = Math.hypot(incoming.x, incoming.y) * Math.hypot(outgoing.x, outgoing.y);
  if (lengths <= 0) return false;
  const cosine = clamp((incoming.x * outgoing.x + incoming.y * outgoing.y) / lengths, -1, 1);
  return Math.acos(cosine) <= Math.PI / 2;
}

function smooth(points: readonly DynamicStrokePoint[], level: number) {
  let result = resample(points);
  const iterations = Math.round(clamp(level, 0, 10) * 3);
  for (let iteration = 0; iteration < iterations && result.length >= 3; iteration += 1) {
    const next = [result[0]!];
    for (let index = 1; index < result.length - 1; index += 1) {
      const previous = result[index - 1]!;
      const current = result[index]!;
      const following = result[index + 1]!;
      const weight = isSharp(previous, current, following)
        ? SHARP_CORNER_SMOOTHING_WEIGHT
        : DEFAULT_SMOOTHING_WEIGHT;
      next.push({
        x: previous.x * weight + current.x * (1 - weight * 2) + following.x * weight,
        y: previous.y * weight + current.y * (1 - weight * 2) + following.y * weight,
        width:
          previous.width * weight + current.width * (1 - weight * 2) + following.width * weight,
      });
    }
    next.push(result[result.length - 1]!);
    result = next;
  }
  return result;
}

function stabilizeEndpoints(points: readonly DynamicStrokePoint[]) {
  const result = points.map((point) => ({ ...point }));
  const total = result.reduce((sum, point, index) => {
    const previous = result[index - 1];
    return previous ? sum + distance(previous, point) : sum;
  }, 0);
  const edge = Math.min(EDGE_WIDTH_DISTANCE_PX, total / 3);
  if (edge <= 0) return result;
  const widthAt = (target: number) => {
    let travelled = 0;
    for (let index = 1; index < result.length; index += 1) {
      travelled += distance(result[index - 1]!, result[index]!);
      if (travelled >= target) return result[index]!.width;
    }
    return result[result.length - 1]?.width ?? 1;
  };
  const startWidth = widthAt(edge);
  const endWidth = widthAt(Math.max(0, total - edge));
  let travelled = 0;
  result.forEach((point, index) => {
    if (index > 0) travelled += distance(result[index - 1]!, point);
    const startBlend = clamp(travelled / edge, 0, 1);
    const endBlend = clamp((total - travelled) / edge, 0, 1);
    if (startBlend < 1) point.width = startWidth * (1 - startBlend) + point.width * startBlend;
    if (endBlend < 1) point.width = endWidth * (1 - endBlend) + point.width * endBlend;
  });
  return result;
}

function normal(start: DrawingPoint, end: DrawingPoint) {
  const length = distance(start, end) || 1;
  return { x: -(end.y - start.y) / length, y: (end.x - start.x) / length };
}

function resolveNormal(points: readonly DynamicStrokePoint[], index: number) {
  return normal(points[Math.max(0, index - 1)]!, points[Math.min(points.length - 1, index + 1)]!);
}

function tangent(points: readonly DynamicStrokePoint[], index: number) {
  const previous = points[Math.max(0, index - 1)]!;
  const next = points[Math.min(points.length - 1, index + 1)]!;
  const length = distance(previous, next) || 1;
  return { x: (next.x - previous.x) / length, y: (next.y - previous.y) / length };
}

function roundedJoin(
  center: DynamicStrokePoint,
  startNormal: DrawingPoint,
  endNormal: DrawingPoint,
  radius: number
) {
  const startAngle = Math.atan2(startNormal.y, startNormal.x);
  let delta = Math.atan2(endNormal.y, endNormal.x) - startAngle;
  while (delta <= -Math.PI) delta += Math.PI * 2;
  while (delta > Math.PI) delta -= Math.PI * 2;
  const steps = Math.max(2, Math.min(6, Math.ceil(Math.abs(delta) / (Math.PI / 10))));
  return Array.from({ length: steps + 1 }, (_, step) => {
    const angle = startAngle + delta * (step / steps);
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

function cap(center: DynamicStrokePoint, start: number, end: number) {
  const points: DrawingPoint[] = [];
  const radius = Math.max(0.5, center.width / 2);
  for (let step = 1; step < 12; step += 1) {
    const angle = start + (end - start) * (step / 12);
    points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return points;
}

function dot(points: readonly DynamicStrokePoint[]) {
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
    x: 0,
    y: 0,
  });
  center.x /= points.length;
  center.y /= points.length;
  const radius = Math.max(0.5, ...points.map((point) => point.width / 2));
  return Array.from({ length: 20 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 20;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

export function buildDrawingStrokeOutline(
  samples: readonly DrawingSample[],
  width: number,
  options: { readonly dynamicWidth: boolean; readonly smoothingLevel?: number }
): DrawingPoint[] {
  if (samples.length === 0) return [];
  const points = stabilizeEndpoints(
    smooth(resolveDynamicPoints(samples, width, options.dynamicWidth), options.smoothingLevel ?? 10)
  );
  const length = points.reduce((sum, point, index) => {
    const previous = points[index - 1];
    return previous ? sum + distance(previous, point) : sum;
  }, 0);
  if (points.length === 1 || length <= Math.max(1, width * 0.2)) return dot(points);
  const left: DrawingPoint[] = [];
  const right: DrawingPoint[] = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    const next = points[index + 1];
    const radius = Math.max(0.5, point.width / 2);
    if (previous && next && isSharp(previous, point, next)) {
      const incoming = normal(previous, point);
      const outgoing = normal(point, next);
      left.push(...roundedJoin(point, incoming, outgoing, radius));
      right.push(
        ...roundedJoin(
          point,
          { x: -incoming.x, y: -incoming.y },
          { x: -outgoing.x, y: -outgoing.y },
          radius
        )
      );
      return;
    }
    const resolved = resolveNormal(points, index);
    left.push({ x: point.x + resolved.x * radius, y: point.y + resolved.y * radius });
    right.push({ x: point.x - resolved.x * radius, y: point.y - resolved.y * radius });
  });
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const startTangent = tangent(points, 0);
  const endTangent = tangent(points, points.length - 1);
  const startAngle = Math.atan2(startTangent.y, startTangent.x);
  const endAngle = Math.atan2(endTangent.y, endTangent.x);
  return [
    ...left,
    ...cap(last, endAngle + Math.PI / 2, endAngle - Math.PI / 2),
    ...right.reverse(),
    ...cap(first, startAngle - Math.PI / 2, startAngle - (Math.PI * 3) / 2),
  ];
}
