import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { CursorFocusPath, CursorFocusSegment } from '../cursor-focus-path/types';
import { cursorFocusKeyControls, evaluateCursorFocusSegment } from '../cursor-focus-path/evaluator';

export const CURSOR_MOTION_SHAPES = ['arrow', 'pointer', 'grab', 'text', 'crosshair'] as const;
export type CursorMotionShape = (typeof CURSOR_MOTION_SHAPES)[number];
export interface CursorMotion {
  id: string;
  start: number;
  end: number;
  enabled: boolean;
  shape: CursorMotionShape;
  size: number;
  color: string;
  outline: string;
  shadow: boolean;
  easing: 'linear' | 'smooth';
  points: { id: string; at: number; x: number; y: number }[];
}
const bounded = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const identity = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.trim() === v && v.length <= 256;
const motionFields = new Set([
  'id',
  'start',
  'end',
  'enabled',
  'shape',
  'size',
  'color',
  'outline',
  'shadow',
  'easing',
  'points',
]);
const pointFields = new Set(['id', 'at', 'x', 'y']);
function isShape(value: unknown): value is CursorMotionShape {
  return (
    value === 'arrow' ||
    value === 'pointer' ||
    value === 'grab' ||
    value === 'text' ||
    value === 'crosshair'
  );
}
/** Admit bounded data before history, rendering or camera planning consumes it. */
export function parseCursorMotions(value: unknown): CursorMotion[] | null {
  if (!Array.isArray(value) || value.length > 512) return null;
  const ids = new Set<string>();
  const result: CursorMotion[] = [];
  for (const raw of value) {
    if (!isRecord(raw) || Object.keys(raw).some((key) => !motionFields.has(key))) return null;
    const {
      id,
      start,
      end,
      enabled,
      shape,
      size,
      color,
      outline,
      shadow,
      easing,
      points: rawPoints,
    } = raw;
    if (
      !identity(id) ||
      ids.has(id) ||
      !bounded(start, 0, 86400) ||
      !bounded(end, 0, 86400) ||
      end <= start ||
      typeof enabled !== 'boolean' ||
      !isShape(shape) ||
      !bounded(size, 12, 160) ||
      typeof color !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(color) ||
      typeof outline !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(outline) ||
      typeof shadow !== 'boolean' ||
      (easing !== 'linear' && easing !== 'smooth') ||
      !Array.isArray(rawPoints) ||
      rawPoints.length < 2 ||
      rawPoints.length > 256
    )
      return null;
    const points: CursorMotion['points'] = [];
    const pointIds = new Set<string>();
    let previous = -1;
    for (const rawPoint of rawPoints) {
      if (!isRecord(rawPoint) || Object.keys(rawPoint).some((key) => !pointFields.has(key)))
        return null;
      const { id: pointId, at, x, y } = rawPoint;
      if (
        !identity(pointId) ||
        pointIds.has(pointId) ||
        !bounded(at, 0, 1) ||
        at <= previous ||
        !bounded(x, 0, 1) ||
        !bounded(y, 0, 1)
      )
        return null;
      pointIds.add(pointId);
      previous = at;
      points.push({ id: pointId, at, x, y });
    }
    if (points[0]!.at !== 0 || points.at(-1)!.at !== 1) return null;
    const motion: CursorMotion = {
      id,
      start,
      end,
      enabled,
      shape,
      size,
      color,
      outline,
      shadow,
      easing,
      points,
    };
    if (enabled && result.some((other) => other.enabled && other.start < end && other.end > start))
      return null;
    ids.add(id);
    result.push(motion);
  }
  return result;
}
const segments = new WeakMap<CursorMotion, CursorFocusSegment>();
export function cursorMotionSegment(motion: CursorMotion): CursorFocusSegment {
  let segment = segments.get(motion);
  if (!segment) {
    segment = {
      id: motion.id,
      binding: { kind: 'project' },
      start: motion.start,
      end: motion.end,
      keys: motion.points.map((p) => ({
        id: p.id,
        time: motion.start + p.at * (motion.end - motion.start),
        x: p.x,
        y: p.y,
        anchor: 'manual' as const,
        authored: true as const,
        interpolation: motion.easing,
      })),
    };
    const curve = segment;
    if (motion.easing === 'smooth')
      segment = {
        ...curve,
        keys: curve.keys.map((k) => {
          const c = cursorFocusKeyControls(curve, k.id, 0.5);
          return {
            ...k,
            ...(c.incoming ? { incoming: c.incoming } : {}),
            ...(c.outgoing ? { outgoing: c.outgoing } : {}),
          };
        }),
      };
    segments.set(motion, segment);
  }
  return segment;
}
export function evaluateCursorMotion(motions: readonly CursorMotion[] | undefined, time: number) {
  const motion = motions?.find((m) => m.enabled && time >= m.start && time < m.end);
  const point = motion && evaluateCursorFocusSegment(cursorMotionSegment(motion), time, 0.5);
  return motion && point ? { motion, ...point } : null;
}
/** Retain old source facts; authored intervals replace only the corresponding focus intervals. */
export function withCursorMotionPath(
  path: CursorFocusPath | undefined,
  motions: readonly CursorMotion[] | undefined
): CursorFocusPath | undefined {
  const active = motions?.filter((m) => m.enabled) ?? [];
  if (!active.length) return path;
  const before = (time: number) => {
    if (time <= 0) return 0;
    const value = new Float64Array([time]);
    const bits = new BigUint64Array(value.buffer);
    bits[0] = bits[0]! - 1n;
    return value[0]!;
  };
  let retained = path?.segments ?? [];
  for (const motion of active)
    retained = retained.flatMap((segment) => {
      if (segment.end <= motion.start || segment.start >= motion.end) return [segment];
      return [
        ...(segment.start < motion.start
          ? [{ ...segment, id: `${segment.id}:before:${motion.id}`, end: before(motion.start) }]
          : []),
        ...(segment.end > motion.end
          ? [{ ...segment, id: `${segment.id}:after:${motion.id}`, start: motion.end }]
          : []),
      ];
    });
  return {
    version: 1,
    mode: path?.mode ?? 'fixed',
    smoothing: path?.smoothing ?? 0.5,
    sensitivity: path?.sensitivity ?? 0.5,
    gapPolicy: path?.gapPolicy ?? 'hold',
    segments: [
      ...active.map((m) => ({ ...cursorMotionSegment(m), end: before(m.end) })),
      ...retained,
    ].sort((a, b) => a.start - b.start),
  };
}
