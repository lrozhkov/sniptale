import { windowHeaderGeometry } from '@sniptale/runtime-contracts/window-header';
import { hasCursorComposition, cameraPerspectiveWithCursor } from '../../project/motion/spatial';
import {
  createCursorOrientationPlan,
  evaluateCursorOrientation,
  smoothCursorCameraPreferences,
  type CursorOrientationPlan,
} from '../../composition/motion/cursor-orientation';
import { reviewRecordingWindow } from '../telemetry';
import { cropWindowCameraObservations as cropCameraObservations } from '../../composition/motion/window-camera-geometry';
import { resolveAuthoredCursorFocusPath } from '../../project/cursor-focus-path/authoring';
import {
  deriveRecordedCursorFocusPath,
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
import type { QuickEditCameraTransform, QuickEditZoomRegion } from './types';
import { fitQuickEditSourceCrop } from './canvas';

export type ReviewCursorFacts = RecordedCursorFacts;
/** Derived focus uses only the observations present in the disposable source window. */
export function deriveReviewCursorFocusPath(
  facts: Parameters<typeof deriveRecordedCursorFocusPath>[0],
  source: Parameters<typeof deriveRecordedCursorFocusPath>[1],
  observed = false,
  retainedKeyId?: string
) {
  const end = reviewRecordingWindow(facts)?.cursorEndSeconds;
  return deriveRecordedCursorFocusPath(
    facts,
    end === undefined ? source : { ...source, duration: Math.min(source.duration, end) },
    observed,
    retainedKeyId
  );
}

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
  run: {
    resultStart: number;
    resultEnd: number;
    sourceStart: number;
    sourceEnd: number;
    rate: number;
  },
  start: number,
  end: number,
  step: number
) {
  const sourceAt = (time: number) =>
    time === run.resultStart
      ? run.sourceStart
      : time === run.resultEnd
        ? run.sourceEnd
        : run.sourceStart + (time - run.resultStart) * run.rate;
  const times = new Map([
    [start, sourceAt(start)],
    [end, sourceAt(end)],
  ]);
  for (let time = start + step; time < end; time += step) times.set(time, sourceAt(time));
  for (const path of [context.path, context.observed]) {
    if (!path) continue;
    for (const segment of path.segments) {
      for (const sourceTime of [
        segment.start,
        segment.end,
        ...segment.keys.map((key) => key.time),
      ]) {
        const time = run.resultStart + (sourceTime - run.sourceStart) / run.rate;
        // A source knot keeps its captured clock; inverse arithmetic can cross its boundary.
        if (time >= start && time <= end) times.set(time, sourceTime);
      }
    }
  }
  return [...times].sort(([a], [b]) => a - b);
}

type ObservationCacheEntry = {
  key: string;
  observed: CursorFocusPath['segments'] | undefined;
  frames: readonly FollowCursorFrame[];
};
const observationFrames = new WeakMap<CursorFocusPath['segments'], ObservationCacheEntry[]>();

/** Retain native observation runs over a camera interval or a link gap. */
export function reviewCameraPlanObservations(region: QuickEditZoomRegion): FollowCursorFrame[] {
  const context = region.cursorFocus;
  if (!context) return [];
  const key = JSON.stringify({
    start: region.start,
    end: region.end,
    smoothing: context.path.smoothing,
    observedSmoothing: context.observed?.smoothing,
    timeMap: context.timeMap,
  });
  const entries = observationFrames.get(context.path.segments) ?? [];
  let retained = entries.find(
    (entry) => entry.key === key && entry.observed === context.observed?.segments
  );
  if (!retained) {
    retained = {
      key,
      observed: context.observed?.segments,
      frames: deriveCameraPlanObservations(region, context),
    };
    entries.push(retained);
    if (entries.length > 8) entries.shift();
    observationFrames.set(context.path.segments, entries);
  }
  const scene = context.scene;
  const crop = scene?.canvas?.crop;
  const frames =
    crop && scene
      ? cropCameraObservations(
          retained.frames,
          fitQuickEditSourceCrop(scene.source, scene.canvas!, crop)
        )
      : retained.frames.map((frame) => ({
          ...frame,
          ...(frame.actual ? { actual: { ...frame.actual } } : {}),
        }));
  return smoothCursorCameraPreferences(frames, region.cursorComposition);
}

/** Native path segments are immutable. Scene geometry is applied after source-clock derivation. */
function deriveCameraPlanObservations(
  region: QuickEditZoomRegion,
  context: NonNullable<QuickEditZoomRegion['cursorFocus']>
) {
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
    for (const [time, sourceTime] of reviewCameraObservationTimes(context, run, start, end, step)) {
      const observedPath = context.observed ?? context.path;
      const touching = observedPath.segments.filter(
        (segment) => segment.start <= sourceTime && segment.end >= sourceTime
      );
      // Both source endpoints own the same captured time; keep their independent constraints.
      for (const sourceSegment of touching.length ? touching : [undefined]) {
        const observed =
          context.observed && sourceSegment
            ? evaluateCursorFocusSegment(sourceSegment, sourceTime, context.observed.smoothing)
            : null;
        const preferredSegment =
          sourceSegment &&
          context.path.segments.find(
            (segment) =>
              segment.id === sourceSegment.id &&
              segment.start <= sourceTime &&
              segment.end >= sourceTime
          );
        const preferred =
          (preferredSegment
            ? evaluateCursorFocusSegment(preferredSegment, sourceTime, context.path.smoothing)
            : evaluateReviewCursorFocus(context.path, sourceTime)) ?? observed;
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
  }
  return frames;
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
    ...(region.cursorComposition ? { tracking: 'continuous' as const } : {}),
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

const orientationPlans = new WeakMap<
  NonNullable<QuickEditZoomRegion['cursorFocus']>,
  Map<string, CursorOrientationPlan | undefined>
>();

/** Observe immutable recording keys before framing preferences or crop visibility filtering. */
function reviewOrientationObservations(context: NonNullable<QuickEditZoomRegion['cursorFocus']>) {
  const path = context.observed ?? context.path;
  const start = Math.min(...path.segments.map((segment) => segment.start));
  const end = Math.max(...path.segments.map((segment) => segment.end));
  const runs = context.timeMap?.filter((run) => run.kind !== 'cut') ?? [
    { resultStart: start, resultEnd: end, sourceStart: start, sourceEnd: end, rate: 1 },
  ];
  const frames: { time: number; x: number; y: number; segmentId: string }[] = [];
  let continuity = 0;
  for (let index = 0; index < runs.length; index++) {
    const run = runs[index]!,
      previous = runs[index - 1];
    if (
      previous &&
      (previous.sourceEnd !== run.sourceStart || previous.resultEnd !== run.resultStart)
    )
      continuity++;
    for (const segment of path.segments) {
      const low = Math.max(run.sourceStart, segment.start),
        high = Math.min(run.sourceEnd, segment.end);
      if (high < low) continue;
      const times = new Set([
        low,
        high,
        ...segment.keys.map((key) => key.time).filter((time) => time > low && time < high),
      ]);
      for (const sourceTime of [...times].sort((a, b) => a - b)) {
        const point = evaluateCursorFocusSegment(segment, sourceTime, 0);
        if (!point) continue;
        frames.push({
          time: run.resultStart + (sourceTime - run.sourceStart) / run.rate,
          x: point.x,
          y: point.y,
          segmentId: `${segment.id}:${continuity}`,
        });
      }
    }
  }
  return frames;
}

/** History belongs to the continuous source run, independently of the active camera region. */
export function resolveReviewCursorOrientation(region: QuickEditZoomRegion) {
  const context = region.cursorFocus;
  if (!context || !hasCursorComposition(region.cursorComposition)) return undefined;
  let plans = orientationPlans.get(context);
  if (!plans) {
    plans = new Map();
    orientationPlans.set(context, plans);
  }
  const key = JSON.stringify({
    settings: region.cursorComposition,
    scene: context.scene,
    timeMap: context.timeMap,
    start: region.start,
    end: region.end,
  });
  if (plans.has(key)) return plans.get(key);
  const observations = reviewOrientationObservations(context);
  const scene = context.scene;
  const crop = scene?.canvas?.crop
    ? fitQuickEditSourceCrop(scene.source, scene.canvas, scene.canvas.crop)
    : { x: 0, y: 0, width: 1, height: 1 };
  const header = scene?.windowHeader
    ? windowHeaderGeometry(scene.windowHeader, scene.source).height
    : 0;
  const plan = createCursorOrientationPlan({
    settings: region.cursorComposition!,
    observations: observations.map((frame) => ({
      ...frame,
      x: (frame.x - crop.x) / crop.width,
      y: scene
        ? (header + (frame.y - crop.y) * scene.source.height) /
          (header + crop.height * scene.source.height)
        : frame.y,
    })),
    start: region.start,
    end: region.end,
  });
  plans.set(key, plan);
  return plan;
}

/** Apply a disposable cursor pose while retaining every authored manual property. */
export function reviewCursorSpatialSettings(
  region: QuickEditZoomRegion,
  time: number,
  base = false
): QuickEditZoomRegion {
  const plan = resolveReviewCursorOrientation(region);
  if (!region.cursorFocus || !region.cursorComposition) return region;
  const { perspective: _perspective, depthOfField: _depth, ...retained } = region;
  return {
    ...retained,
    ...cameraPerspectiveWithCursor(
      region,
      base ? { x: 0, y: 0 } : evaluateCursorOrientation(plan, time)
    ),
  };
}
