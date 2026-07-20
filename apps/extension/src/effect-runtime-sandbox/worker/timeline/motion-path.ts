import { resolveTimelineEase } from './easing.js';
import type {
  NormalizedTimeline,
  NormalizedTimelineKeyframe,
  NormalizedTimelineTrack,
} from '../model/types.js';
import { normalizeMotionPaths } from './motion-path-normalization.js';
import type {
  MotionPathGeometryResult,
  MotionPathTangent,
  ResolvedMotionPathPoint,
} from './motion-path-types.js';

export { normalizeMotionPaths } from './motion-path-normalization.js';
export * from './motion-path-types.js';

export function createMotionPathGeometry(
  timeline: NormalizedTimeline,
  layerId: string,
  options: {
    getTrackKeyframes?: (track: NormalizedTimelineTrack) => NormalizedTimelineKeyframe[];
  } = {}
): MotionPathGeometryResult {
  const path = normalizeMotionPaths(timeline.motionPaths).find(
    (entry) => entry.layerId === layerId
  );
  if (!path) return { layerId, ok: false, reason: 'missing-path' };
  const xTrack = findMotionPathTrack(timeline, layerId, 'x');
  const yTrack = findMotionPathTrack(timeline, layerId, 'y');
  if (!xTrack || !yTrack) return { layerId, ok: false, reason: 'missing-track' };
  const getKeyframes = options.getTrackKeyframes ?? ((track) => track.keyframes);
  const xById = new Map(getKeyframes(xTrack).map((keyframe) => [keyframe.id, keyframe]));
  const yById = new Map(getKeyframes(yTrack).map((keyframe) => [keyframe.id, keyframe]));
  const points: ResolvedMotionPathPoint[] = [];
  for (const point of path.points) {
    const xKeyframe = xById.get(point.xKeyframeId);
    const yKeyframe = yById.get(point.yKeyframeId);
    if (!xKeyframe || !yKeyframe) return { layerId, ok: false, reason: 'missing-keyframe' };
    if (!Number.isFinite(xKeyframe.value) || !Number.isFinite(yKeyframe.value)) {
      return { layerId, ok: false, reason: 'non-numeric' };
    }
    if (Math.abs(xKeyframe.time - yKeyframe.time) > 0.0001) {
      return { layerId, ok: false, reason: 'time-mismatch' };
    }
    if (!motionPathTemporalKeyframesMatch(xKeyframe, yKeyframe)) {
      return { layerId, ok: false, reason: 'temporal-mismatch' };
    }
    points.push({
      ...point,
      time: xKeyframe.time,
      x: Number(xKeyframe.value),
      xKeyframe,
      y: Number(yKeyframe.value),
      yKeyframe,
    });
  }
  points.sort((left, right) => left.time - right.time);
  if (points.some((point, index) => index > 0 && point.time === points[index - 1]!.time)) {
    return { layerId, ok: false, reason: 'duplicate-time' };
  }
  return { layerId, ok: true, points, xTrack, yTrack };
}

export function evaluateMotionPathGeometry(
  geometry: Extract<MotionPathGeometryResult, { ok: true }>,
  time: number
): { x: number; y: number } | null {
  const points = geometry.points;
  if (points.length === 0) return null;
  if (time <= points[0]!.time) return pickMotionPathPosition(points[0]!);
  const last = points.at(-1)!;
  if (time >= last.time) return pickMotionPathPosition(last);
  const index = findMotionPathSegmentIndex(points, time);
  const from = points[index]!;
  const to = points[index + 1]!;
  const raw = Math.min(1, Math.max(0, (time - from.time) / Math.max(0.0001, to.time - from.time)));
  const progress = resolveTimelineEase(from.xKeyframe, raw);
  const linearSegment = from.kind === 'linear';
  const firstControl = addMotionPathVector(from, linearSegment ? null : from.outTangent);
  const secondControl = addMotionPathVector(
    to,
    linearSegment || to.kind === 'linear' ? null : to.inTangent
  );
  return {
    x: cubicBezierCoordinate(from.x, firstControl.x, secondControl.x, to.x, progress),
    y: cubicBezierCoordinate(from.y, firstControl.y, secondControl.y, to.y, progress),
  };
}

export function getMotionPathLayerProperty(track: NormalizedTimelineTrack): {
  layerId: string;
  property: 'x' | 'y';
} | null {
  const property = track.property || track.id.split('.').at(-1);
  if (property !== 'x' && property !== 'y') return null;
  const layerId =
    track.layerId ||
    (track.target !== 'scene' ? track.target : '') ||
    track.id.split('.').slice(0, -1).join('.');
  return layerId ? { layerId, property } : null;
}

export function motionPathTemporalKeyframesMatch(
  left: NormalizedTimelineKeyframe,
  right: NormalizedTimelineKeyframe
): boolean {
  if (left.easing !== right.easing) return false;
  if (left.easing !== 'bezier') return true;
  return (
    close(left.handles.x1, right.handles.x1) &&
    close(left.handles.y1, right.handles.y1) &&
    close(left.handles.x2, right.handles.x2) &&
    close(left.handles.y2, right.handles.y2)
  );
}

function findMotionPathTrack(
  timeline: NormalizedTimeline,
  layerId: string,
  property: 'x' | 'y'
): NormalizedTimelineTrack | undefined {
  return timeline.tracks.find((track) => {
    const target = getMotionPathLayerProperty(track);
    return target?.layerId === layerId && target.property === property;
  });
}

function findMotionPathSegmentIndex(points: ResolvedMotionPathPoint[], time: number): number {
  let low = 1;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) * 0.5);
    if (time <= points[middle]!.time) high = middle;
    else low = middle + 1;
  }
  return low - 1;
}

function pickMotionPathPosition(point: ResolvedMotionPathPoint): { x: number; y: number } {
  return { x: point.x, y: point.y };
}

function addMotionPathVector(
  point: ResolvedMotionPathPoint,
  vector: MotionPathTangent | null
): { x: number; y: number } {
  return { x: point.x + (vector?.x ?? 0), y: point.y + (vector?.y ?? 0) };
}

function cubicBezierCoordinate(
  a: number,
  b: number,
  c: number,
  d: number,
  progress: number
): number {
  const inverse = 1 - progress;
  return (
    inverse ** 3 * a +
    3 * inverse ** 2 * progress * b +
    3 * inverse * progress ** 2 * c +
    progress ** 3 * d
  );
}

function close(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.0001;
}
