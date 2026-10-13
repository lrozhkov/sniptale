import {
  simplifyCursorFocusPath,
  compareCursorFocusKeys,
  resolveAuthoredCursorFocusPath,
} from '../../project/cursor-focus-path/authoring';
import type {
  RecordingActionEvent,
  RecordingTelemetrySignal,
  VideoProjectCursorTrack,
} from '../../project/types';
import type { CursorFocusPath, CursorFocusSegment } from '../../project/cursor-focus-path/types';
import { evaluateCursorFocusSegment } from '../../project/cursor-focus-path/evaluator';
import {
  planFollowCursorCamera,
  evaluateFollowCursorCamera,
  type FollowCursorFrame,
} from '../../composition/motion/follow-cursor';
import type { ReviewTimeSegment } from '../time-segment';
import type { QuickEditCameraTransform, QuickEditZoomRegion } from './types';

export interface ReviewCursorFacts {
  cursorTrack: VideoProjectCursorTrack | null;
  actionEvents: readonly RecordingActionEvent[];
  signals: readonly RecordingTelemetrySignal[];
}

/** Source-time authoring adapter. Coverage markers cut the path; exact click/dwell anchors survive. */
export function deriveReviewCursorFocusPath(
  facts: ReviewCursorFacts | null,
  source: { width: number; height: number; duration: number },
  observed = false
): CursorFocusPath {
  const segments = deriveReviewCapturedSegments(facts, source, observed);
  const anchors = deriveReviewFocusAnchors(facts);
  appendReviewFocusAnchors(segments, anchors, facts, observed);
  const path: CursorFocusPath = {
    version: 1,
    smoothing: 0.5,
    sensitivity: 0.5,
    mode: 'fixed',
    gapPolicy: 'hold',
    segments,
  };
  if (observed) {
    for (const segment of path.segments)
      for (const key of segment.keys) key.interpolation = 'linear';
  }
  return observed ? path : simplifyCursorFocusPath(path);
}

export function evaluateReviewCursorFocus(path: CursorFocusPath, sourceTime: number) {
  for (const segment of path.segments) {
    const point = evaluateCursorFocusSegment(segment, sourceTime, path.smoothing);
    if (point) return point;
  }
  return null;
}

function sourceTimeAt(time: number, segments: readonly ReviewTimeSegment[] | undefined) {
  if (!segments) return time;
  const run = segments.find(
    (item) => item.kind !== 'cut' && time >= item.resultStart && time < item.resultEnd
  );
  return run ? run.sourceStart + (time - run.resultStart) * run.rate : null;
}

const plans = new WeakMap<
  NonNullable<QuickEditZoomRegion['cursorFocus']>,
  Map<string, ReturnType<typeof planFollowCursorCamera>>
>();

/** Shared preview/export camera adapter; dynamics are rebuilt after speed/cut mapping. */
export function evaluateReviewFollowCursor(
  region: QuickEditZoomRegion,
  time: number,
  camera: QuickEditCameraTransform
) {
  const context = region.cursorFocus;
  const path = context?.path;
  if (!context || !path || path.mode !== 'follow') return camera;
  let contextPlans = plans.get(context);
  if (!contextPlans) {
    contextPlans = new Map();
    plans.set(context, contextPlans);
  }
  const planKey = `${region.id}:${region.start}:${region.end}:${region.transform.scale}`;
  let plan = contextPlans.get(planKey);
  if (!plan) {
    const frames: FollowCursorFrame[] = [];
    const step = Math.max(1 / 30, (region.end - region.start) / 18000);
    for (let output = region.start; output <= region.end; output += step) {
      const source = sourceTimeAt(output, region.cursorFocus?.timeMap);
      if (source === null) continue;
      const point = evaluateReviewCursorFocus(path, source);
      if (!point) continue;
      const observed =
        region.cursorFocus?.observed &&
        evaluateReviewCursorFocus(region.cursorFocus.observed, source);
      const run =
        region.cursorFocus?.timeMap?.findIndex(
          (item) => item.kind !== 'cut' && output >= item.resultStart && output < item.resultEnd
        ) ?? 0;
      const focus = windowPoint(region, point);
      const actual = observed ? windowPoint(region, observed) : undefined;
      frames.push({
        ...focus,
        segmentId: `${point.segmentId}:${run}`,
        time: output,
        ...(actual ? { actual } : {}),
      });
    }
    plan = planFollowCursorCamera(frames, region.transform.scale, path.sensitivity);
    contextPlans.set(planKey, plan);
  }
  const sourceTime = sourceTimeAt(time, region.cursorFocus?.timeMap);
  const observed =
    sourceTime === null || !region.cursorFocus?.observed
      ? undefined
      : (evaluateReviewCursorFocus(region.cursorFocus.observed, sourceTime) ?? undefined);
  const pose = evaluateFollowCursorCamera(
    plan,
    time,
    observed ? windowPoint(region, observed) : undefined,
    camera.scale
  );
  return pose ? { ...camera, centerX: pose.x, centerY: pose.y } : camera;
}

function windowPoint(region: QuickEditZoomRegion, point: { x: number; y: number }) {
  const frame = region.cursorFocus?.sourceFrame;
  return frame
    ? {
        x: point.x,
        y: (frame.headerHeight + point.y * frame.height) / (frame.headerHeight + frame.height),
      }
    : point;
}

/** Resolves immutable recording facts plus sparse project-owned authoring without writing on read. */
export function resolveReviewCursorFocusPath(
  facts: ReviewCursorFacts | null,
  source: { width: number; height: number; duration: number },
  authored: CursorFocusPath | undefined
) {
  return resolveAuthoredCursorFocusPath(deriveReviewCursorFocusPath(facts, source), authored);
}

function deriveReviewCapturedSegments(
  facts: ReviewCursorFacts | null,
  source: { width: number; height: number; duration: number },
  observed: boolean
): CursorFocusSegment[] {
  const segments: CursorFocusSegment[] = [];
  let active: CursorFocusSegment | undefined;
  let captureSegment: number | undefined;
  for (const sample of facts?.cursorTrack?.samples ?? []) {
    const point =
      sample.recordingPoint === undefined ||
      sample.recordingPoint === null ||
      !sample.visible ||
      (sample.observation && sample.observation !== 'observed')
        ? null
        : (sample.recordingPoint ?? { x: sample.x / source.width, y: sample.y / source.height });
    if (!point) {
      if (active) active.end = active.keys.at(-1)!.time;
      active = undefined;
      continue;
    }
    if (!active || captureSegment !== sample.captureSegment) {
      if (active) active.end = active.keys.at(-1)!.time;
      active = {
        id: `segment:${sample.id}`,
        binding: { kind: 'project' },
        start: sample.time,
        end: source.duration,
        keys: [],
      };
      segments.push(active);
      captureSegment = sample.captureSegment;
    }
    active.keys.push({
      id: sample.id,
      time: sample.time,
      ...point,
      anchor: active.keys.length ? 'movement' : 'boundary',
      interpolation: observed ? 'linear' : 'smooth',
    });
  }
  return segments;
}

function deriveReviewFocusAnchors(facts: ReviewCursorFacts | null) {
  const anchors = [
    ...(facts?.actionEvents ?? []).flatMap((event) =>
      event.kind === 'CLICK' && event.recordingPoint
        ? [
            {
              id: `click:${event.id}`,
              time: event.time,
              ...event.recordingPoint,
              anchor: 'click' as const,
              interpolation: 'smooth' as const,
            },
            ...(event.data['completion'] === 'released' &&
            typeof event.data['upTime'] === 'number' &&
            typeof event.data['recordingUpX'] === 'number' &&
            typeof event.data['recordingUpY'] === 'number'
              ? [
                  {
                    id: `release:${event.id}`,
                    time: event.data['upTime'],
                    x: event.data['recordingUpX'],
                    y: event.data['recordingUpY'],
                    anchor: 'click' as const,
                    interpolation: 'smooth' as const,
                  },
                ]
              : []),
          ]
        : []
    ),
    ...(facts?.signals ?? []).flatMap((signal) =>
      signal.kind === 'cursor-idle' && signal.recordingPoint
        ? [
            {
              id: `dwell-start:${signal.id}`,
              time: signal.startTime,
              ...signal.recordingPoint,
              anchor: 'dwell' as const,
              interpolation: 'hold' as const,
            },
            {
              id: `dwell-end:${signal.id}`,
              time: signal.endTime,
              ...signal.recordingPoint,
              anchor: 'dwell' as const,
              interpolation: 'smooth' as const,
            },
          ]
        : []
    ),
  ];
  return anchors;
}

function appendReviewFocusAnchors(
  segments: CursorFocusSegment[],
  anchors: CursorFocusSegment['keys'],
  facts: ReviewCursorFacts | null,
  observed: boolean
): void {
  for (const segment of segments) {
    if (!observed)
      segment.keys = segment.keys.filter(
        (key) =>
          key.anchor !== 'movement' ||
          !(facts?.signals ?? []).some(
            (signal) =>
              signal.kind === 'cursor-idle' &&
              signal.recordingPoint &&
              key.time > signal.startTime &&
              key.time < signal.endTime
          )
      );
    segment.keys.push(
      ...anchors.filter((key) => key.time >= segment.start && key.time <= segment.end)
    );
    segment.keys.sort(compareCursorFocusKeys);
    const last = segment.keys.at(-1)!;
    if (last.time < segment.end)
      segment.keys.push({
        ...last,
        id: `end:${segment.id}`,
        time: segment.end,
        anchor: 'boundary',
      });
    else if (last.anchor === 'movement') last.anchor = 'boundary';
  }
}
