import { resolveAuthoredCursorFocusPath } from '../../project/cursor-focus-path/authoring';
import {
  deriveRecordedCursorFocusPath as deriveReviewCursorFocusPath,
  type RecordedCursorFacts,
} from '../../project/cursor-focus-path/recorded';
import type { CursorFocusPath } from '../../project/cursor-focus-path/types';
import {
  cursorFocusPreferenceWeight,
  evaluateCursorFocusSegment,
} from '../../project/cursor-focus-path/evaluator';
import {
  planWorkingZoneCamera,
  evaluateWorkingZoneCamera,
  type FollowCursorFrame,
  type WorkingZoneCameraGeometry,
  type WorkingZoneCameraPlan,
  type WorkingZoneCameraBoundaries,
} from '../../composition/motion/follow-cursor';
import { resolveCameraFollowPolicy } from '../../project/camera/cursor-policy';
import type { QuickEditCameraTransform, QuickEditZoomRegion, QuickEditRect } from './types';
import { fitQuickEditSourceCrop } from './canvas';

export type ReviewCursorFacts = RecordedCursorFacts;
export { deriveReviewCursorFocusPath };

export function evaluateReviewCursorFocus(path: CursorFocusPath, sourceTime: number) {
  for (const segment of path.segments) {
    const point = evaluateCursorFocusSegment(segment, sourceTime, path.smoothing);
    if (point) return point;
  }
  return null;
}

const plans = new WeakMap<
  NonNullable<QuickEditZoomRegion['cursorFocus']>,
  WeakMap<
    WorkingZoneCameraGeometry,
    Map<string, { signature: string; plan: WorkingZoneCameraPlan }>
  >
>();

function reviewCameraObservationTimes(
  context: NonNullable<QuickEditZoomRegion['cursorFocus']>,
  run: { resultStart: number; sourceStart: number; rate: number },
  start: number,
  end: number,
  step: number
) {
  const times = new Set([start, end]);
  for (let time = start + step; time < end; time += step) times.add(time);
  for (const path of [context.path, context.observed]) {
    if (!path) continue;
    for (const segment of path.segments) {
      for (const sourceTime of [
        segment.start,
        segment.end,
        ...segment.keys.map((key) => key.time),
      ]) {
        const time = run.resultStart + (sourceTime - run.sourceStart) / run.rate;
        if (time >= start && time <= end) times.add(time);
      }
    }
  }
  return [...times].sort((a, b) => a - b);
}

/** Retain native observation runs over a camera interval or a link gap. */
export function reviewCameraPlanObservations(region: QuickEditZoomRegion): FollowCursorFrame[] {
  const context = region.cursorFocus;
  if (!context) return [];
  const runs = context.timeMap?.filter((run) => run.kind !== 'cut') ?? [
    {
      resultStart: region.start,
      resultEnd: region.end,
      sourceStart: region.start,
      sourceEnd: region.end,
      rate: 1,
    },
  ];
  const frames: FollowCursorFrame[] = [];
  const step = Math.max(1 / 30, (region.end - region.start) / 18000);
  let continuity = 0;
  for (let index = 0; index < runs.length; index++) {
    const run = runs[index]!;
    const previous = runs[index - 1];
    if (
      previous &&
      (Math.abs(previous.resultEnd - run.resultStart) > 1e-9 ||
        Math.abs(previous.sourceEnd - run.sourceStart) > 1e-9)
    )
      continuity++;
    const start = Math.max(region.start, run.resultStart);
    const end = Math.min(region.end, run.resultEnd);
    if (end < start) continue;
    for (const time of reviewCameraObservationTimes(context, run, start, end, step)) {
      const sourceTime =
        time === run.resultStart
          ? run.sourceStart
          : time === run.resultEnd
            ? run.sourceEnd
            : run.sourceStart + (time - run.resultStart) * run.rate;
      const observed = context.observed
        ? evaluateReviewCursorFocus(context.observed, sourceTime)
        : null;
      const preferred = evaluateReviewCursorFocus(context.path, sourceTime) ?? observed;
      if (!preferred) continue;
      const authoredSegment = context.path.segments.find(
        (segment) => segment.id === preferred.segmentId
      );
      const segmentId = `${observed?.segmentId ?? preferred.segmentId}:${continuity}`;
      const previousFrame = frames.at(-1);
      if (previousFrame?.time === time && previousFrame.segmentId === segmentId) continue;
      frames.push({
        x: preferred.x,
        y: preferred.y,
        time,
        ...(authoredSegment
          ? { preferenceWeight: cursorFocusPreferenceWeight(authoredSegment, sourceTime) }
          : {}),
        segmentId,
        ...(observed ? { actual: { x: observed.x, y: observed.y } } : {}),
      });
    }
  }
  const scene = context.scene;
  const crop = scene?.canvas?.crop;
  return crop && scene
    ? cropCameraObservations(frames, fitQuickEditSourceCrop(scene.source, scene.canvas!, crop))
    : frames;
}

/** Clip native linear observations without joining separate visible visits across discarded pixels. */
function cropCameraObservations(frames: readonly FollowCursorFrame[], crop: QuickEditRect) {
  const result: FollowCursorFrame[] = [];
  let visit = 0;
  let previousEnd = -Infinity;
  let previousSegment = '';
  for (let index = 0; index < frames.length; index++) {
    const a = frames[index]!;
    const next = frames[index + 1];
    const b = next?.segmentId === a.segmentId ? next : a;
    const from = a.actual ?? a;
    const to = b.actual ?? b;
    let low = 0,
      high = 1;
    for (const axis of ['x', 'y'] as const) {
      const start = crop[axis];
      const end = start + (axis === 'x' ? crop.width : crop.height);
      const delta = to[axis] - from[axis];
      if (delta === 0) {
        if (from[axis] < start || from[axis] > end) high = -1;
      } else {
        const left = (start - from[axis]) / delta;
        const right = (end - from[axis]) / delta;
        low = Math.max(low, Math.min(left, right));
        high = Math.min(high, Math.max(left, right));
      }
    }
    if (low > high) continue;
    const startTime = a.time + (b.time - a.time) * low;
    if (previousSegment !== a.segmentId || Math.abs(previousEnd - startTime) > 1e-9) visit++;
    const segmentId = `${a.segmentId}:crop:${visit}`;
    for (const fraction of [low, high]) {
      const mix = (left: number, right: number) => left + (right - left) * fraction;
      const time = mix(a.time, b.time);
      if (result.at(-1)?.time === time && result.at(-1)?.segmentId === segmentId) continue;
      const { actual: _actual, ...base } = a;
      result.push({
        ...base,
        time,
        segmentId,
        x: mix(a.x, b.x),
        y: mix(a.y, b.y),
        ...(a.actual && b.actual ? { actual: { x: mix(from.x, to.x), y: mix(from.y, to.y) } } : {}),
      });
    }
    previousEnd = a.time + (b.time - a.time) * high;
    previousSegment = a.segmentId;
  }
  return result;
}

/** Admit native facts and sparse authoring against the exact consuming renderer geometry. */
export function resolveReviewCursorCameraPlan(
  region: QuickEditZoomRegion,
  geometry: WorkingZoneCameraGeometry,
  boundaries: WorkingZoneCameraBoundaries = {}
): WorkingZoneCameraPlan {
  const context = region.cursorFocus;
  if (!context)
    return {
      status: 'conflict',
      reason: 'unproven',
      interval: { start: region.start, end: region.end },
      time: region.start,
      fallback: { x: 0, y: 0 },
    };
  let geometries = plans.get(context);
  if (!geometries) {
    geometries = new WeakMap();
    plans.set(context, geometries);
  }
  let cached = geometries.get(geometry);
  if (!cached) {
    cached = new Map();
    geometries.set(geometry, cached);
  }
  const signature = `${region.start}:${region.end}:${region.transform.scale}:${region.transform.centerX}:${region.transform.centerY}:${context.path.smoothing}:${context.path.sensitivity}`;
  const key = `${region.id}:${JSON.stringify(boundaries)}`;
  const previous = cached.get(key);
  if (previous?.signature === signature) return previous.plan;
  const policy =
    context.policy ?? resolveCameraFollowPolicy({ legacySensitivity: context.path.sensitivity });
  const plan = planWorkingZoneCamera({
    frames: reviewCameraPlanObservations(region),
    start: region.start,
    end: region.end,
    targetScale: region.transform.scale,
    geometry,
    policy,
    ...boundaries,
    fallback: {
      x:
        Math.max(
          0,
          Math.min(
            region.transform.scale - 1,
            region.transform.centerX * region.transform.scale - 0.5
          )
        ) * geometry.window.width,
      y:
        Math.max(
          0,
          Math.min(
            region.transform.scale - 1,
            region.transform.centerY * region.transform.scale - 0.5
          )
        ) * geometry.window.height,
    },
  });
  cached.set(key, { signature, plan });
  if (cached.size > 16) cached.delete(cached.keys().next().value ?? '');
  return plan;
}

/** Shared random-access adapter. An unresolved plan preserves a deterministic preview pose. */
export function evaluateReviewFollowCursor(
  region: QuickEditZoomRegion,
  time: number,
  camera: QuickEditCameraTransform,
  geometry?: WorkingZoneCameraGeometry,
  admittedPlan?: WorkingZoneCameraPlan
) {
  const context = region.cursorFocus;
  if (!context || context.path.mode !== 'follow' || !geometry) return camera;
  const plan = admittedPlan ?? resolveReviewCursorCameraPlan(region, geometry);
  const pan = evaluateWorkingZoneCamera(plan, time);
  const targetScale = plan.status === 'ready' ? plan.targetScale : region.transform.scale;
  const progress =
    region.transform.scale > 1 ? (camera.scale - 1) / (region.transform.scale - 1) : 1;
  const scale = 1 + (targetScale - 1) * progress;
  return {
    ...camera,
    scale,
    centerX: (0.5 + (progress * pan.x) / geometry.window.width) / scale,
    centerY: (0.5 + (progress * pan.y) / geometry.window.height) / scale,
  };
}

/** Resolves immutable recording facts plus sparse project-owned authoring without writing on read. */
export function resolveReviewCursorFocusPath(
  facts: ReviewCursorFacts | null,
  source: { width: number; height: number; duration: number },
  authored: CursorFocusPath | undefined
) {
  return resolveAuthoredCursorFocusPath(deriveReviewCursorFocusPath(facts, source), authored);
}

/** Test the same captured source clock and coverage runs that feed camera observations. */
export function hasContinuousReviewCameraSource(
  context: NonNullable<QuickEditZoomRegion['cursorFocus']>,
  time: number
) {
  const before = context.timeMap?.find(
    (run) => run.kind !== 'cut' && run.resultStart < time && run.resultEnd >= time
  );
  const after = context.timeMap?.find(
    (run) => run.kind !== 'cut' && run.resultStart <= time && run.resultEnd > time
  );
  const sourceTime = before ? before.sourceStart + (time - before.resultStart) * before.rate : time;
  if (
    context.timeMap &&
    (!before ||
      !after ||
      Math.abs(sourceTime - (after.sourceStart + (time - after.resultStart) * after.rate)) > 1e-9)
  )
    return false;
  const observed = context.observed ?? context.path;
  if (
    observed.segments.length &&
    !observed.segments.some((segment) => segment.start < sourceTime && segment.end > sourceTime)
  )
    return false;
  return true;
}
