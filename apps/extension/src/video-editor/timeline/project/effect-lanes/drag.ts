import { constrainMotionTiming } from '../../../../features/video/project/motion/placement';
import { clampNumber } from '../../../../features/video/project/hydration';
import type { VideoProject } from '../../../../features/video/project/types';
import type {
  ProjectTimelineProps,
  TimelineEffectDragTarget,
  TimelineEffectDragDraft,
} from '../types';
import { snapTimelineTime } from './snap';
import { clampMotionRegionStartTime } from '../../../../features/video/project/motion/source-binding';

export interface EffectInteraction {
  startClientX: number;
  target: TimelineEffectDragTarget;
}

export interface EffectMoveCallbacks {
  onMoveActionOccurrence?: ProjectTimelineProps['onMoveActionOccurrence'];
  onMoveCursorSegment: ProjectTimelineProps['onMoveCursorSegment'];
  onMoveMotionRegion: ProjectTimelineProps['onMoveMotionRegion'];
  onMoveTransitionSegment: ProjectTimelineProps['onMoveTransitionSegment'];
  onResizeMotionRegion: ProjectTimelineProps['onResizeMotionRegion'];
  onUpdateEffectInstance: ProjectTimelineProps['onUpdateEffectInstance'];
}

type MotionDragTarget = Extract<TimelineEffectDragTarget, { kind: 'motion' }>;

function resolveCursorRange(
  target: Extract<TimelineEffectDragTarget, { kind: 'cursor' }>,
  delta: number
) {
  if (target.nextSampleId === null) {
    return {
      endTime: null,
      startTime: clampNumber(
        target.originalStart + delta,
        target.previousBoundary,
        target.nextBoundary
      ),
    };
  }

  const duration = target.originalEnd - target.originalStart;
  const maxStart = Math.max(target.previousBoundary, target.nextBoundary - duration);
  const startTime = clampNumber(target.originalStart + delta, target.previousBoundary, maxStart);

  return {
    endTime: startTime + duration,
    startTime,
  };
}

function resolveMotionRegionRange(
  target: MotionDragTarget,
  delta: number,
  projectDuration: number
) {
  switch (target.mode) {
    case 'move':
      return {
        duration: target.originalDuration,
        startTime: clampNumber(
          target.originalStart + delta,
          0,
          Math.max(0, projectDuration - target.originalDuration)
        ),
      };
    case 'resize-start': {
      const maxStart = target.originalStart + target.originalDuration - 0.1;
      const startTime = clampNumber(target.originalStart + delta, 0, maxStart);
      return {
        duration: target.originalDuration - (startTime - target.originalStart),
        startTime,
      };
    }
    case 'resize-end':
      return {
        duration: clampNumber(
          target.originalDuration + delta,
          0.1,
          projectDuration - target.originalStart
        ),
        startTime: target.originalStart,
      };
  }
}

function moveMotionRegionTarget(
  target: MotionDragTarget,
  delta: number,
  magnetEnabled: boolean,
  pixelsPerSecond: number,
  project: VideoProject,
  projectDuration: number,
  callbacks: EffectMoveCallbacks
) {
  if (target.mode === 'move') {
    callbacks.onMoveMotionRegion(
      target.motionRegionId,
      snapMotionRegionStartTime({
        magnetEnabled,
        pixelsPerSecond,
        project,
        projectDuration,
        target,
        startTime: Math.max(0, target.originalStart + delta),
      })
    );
    return;
  }

  const { duration, startTime } = resolveMotionRegionRange(target, delta, projectDuration);
  const [snappedStart, snappedDuration] = snapMotionRegionRange({
    duration,
    magnetEnabled,
    pixelsPerSecond,
    project,
    startTime,
    target,
  });
  const region = project.motionRegions?.find((item) => item.id === target.motionRegionId);
  const range = { startTime: snappedStart, duration: snappedDuration };
  const constrained = region ? constrainMotionTiming(project, region, range, false) : range;
  callbacks.onResizeMotionRegion(
    target.motionRegionId,
    constrained.startTime,
    constrained.duration
  );
}

export function moveEffectTarget(
  interaction: EffectInteraction,
  magnetEnabled: boolean,
  pixelsPerSecond: number,
  project: VideoProject,
  projectDuration: number,
  moveEvent: PointerEvent,
  callbacks: EffectMoveCallbacks,
  viewportDeltaSeconds = 0
): void {
  const delta =
    (moveEvent.clientX - interaction.startClientX) / pixelsPerSecond + viewportDeltaSeconds;

  switch (interaction.target.kind) {
    case 'action': {
      const target = interaction.target;
      const requested = target.originalStart + delta;
      const snapped = magnetEnabled
        ? snapTimelineTime(requested, project, pixelsPerSecond)
        : requested;
      callbacks.onMoveActionOccurrence?.(
        target.eventId,
        target.clipId,
        clampNumber(snapped, target.minimumTime, target.maximumTime)
      );
      return;
    }
    case 'cursor':
      moveCursorSegmentTarget(interaction.target, delta, callbacks);
      return;
    case 'transition':
      moveTransitionSegmentTarget(interaction.target, delta, callbacks);
      return;
    case 'motion':
      moveMotionRegionTarget(
        interaction.target,
        delta,
        magnetEnabled,
        pixelsPerSecond,
        project,
        projectDuration,
        callbacks
      );
      return;
    case 'effect-instance':
      if (interaction.target.movable) {
        callbacks.onUpdateEffectInstance(interaction.target.instanceId, {
          startTime: Math.max(0, interaction.target.originalStart + delta),
        });
      }
      return;
  }
}

function moveCursorSegmentTarget(
  target: Extract<TimelineEffectDragTarget, { kind: 'cursor' }>,
  delta: number,
  callbacks: EffectMoveCallbacks
): void {
  const { endTime, startTime } = resolveCursorRange(target, delta);
  callbacks.onMoveCursorSegment(target.sampleId, target.nextSampleId, startTime, endTime);
}

function moveTransitionSegmentTarget(
  target: Extract<TimelineEffectDragTarget, { kind: 'transition' }>,
  delta: number,
  callbacks: EffectMoveCallbacks
): void {
  const transitionId = target.transitionId ?? target.clipId;
  if (transitionId) {
    callbacks.onMoveTransitionSegment(transitionId, Math.max(0, target.originalStart + delta));
  }
}

function snapMotionRegionStartTime(params: {
  magnetEnabled: boolean;
  pixelsPerSecond: number;
  project: VideoProject;
  projectDuration: number;
  startTime: number;
  target: MotionDragTarget;
}): number {
  const snappedStart = params.magnetEnabled
    ? snapTimelineTime(params.startTime, params.project, params.pixelsPerSecond)
    : params.startTime;
  const region = params.project.motionRegions?.find(
    (item) => item.id === params.target.motionRegionId
  );
  if (region)
    return constrainMotionTiming(
      params.project,
      region,
      { startTime: snappedStart, duration: region.duration },
      true
    ).startTime;
  return clampMotionRegionStartTime(
    params.project,
    region ?? { duration: params.target.originalDuration },
    snappedStart
  );
}

function snapMotionRegionRange(params: {
  duration: number;
  magnetEnabled: boolean;
  pixelsPerSecond: number;
  project: VideoProject;
  startTime: number;
  target: MotionDragTarget;
}): [startTime: number, duration: number] {
  if (!params.magnetEnabled) {
    return [params.startTime, params.duration];
  }

  if (params.target.mode === 'resize-start') {
    const maxStart = params.target.originalStart + params.target.originalDuration - 0.1;
    const startTime = clampNumber(
      snapTimelineTime(params.startTime, params.project, params.pixelsPerSecond),
      0,
      maxStart
    );
    return [startTime, params.target.originalDuration - (startTime - params.target.originalStart)];
  }

  const endTime = snapTimelineTime(
    params.startTime + params.duration,
    params.project,
    params.pixelsPerSecond
  );
  return [params.startTime, clampNumber(endTime - params.startTime, 0.1, params.project.duration)];
}

/** Collects one proposed command and its display geometry without changing project state. */
export function createEffectDraftCallbacks(
  callbacks: EffectMoveCallbacks,
  stage: (commit: () => void, range: Omit<TimelineEffectDragDraft, 'segmentId'>) => void
): EffectMoveCallbacks {
  return {
    onMoveActionOccurrence: (id, clipId, startTime) =>
      stage(() => callbacks.onMoveActionOccurrence?.(id, clipId, startTime), { startTime }),
    onMoveCursorSegment: (id, nextId, startTime, endTime) =>
      stage(
        () => callbacks.onMoveCursorSegment(id, nextId, startTime, endTime),
        endTime === null ? { startTime } : { startTime, duration: endTime - startTime }
      ),
    onMoveMotionRegion: (id, startTime) =>
      stage(() => callbacks.onMoveMotionRegion(id, startTime), { startTime }),
    onResizeMotionRegion: (id, startTime, duration) =>
      stage(() => callbacks.onResizeMotionRegion(id, startTime, duration), { startTime, duration }),
    onMoveTransitionSegment: (id, startTime) =>
      stage(() => callbacks.onMoveTransitionSegment(id, startTime), { startTime }),
    onUpdateEffectInstance: (id, patch) =>
      stage(
        () => callbacks.onUpdateEffectInstance(id, patch),
        typeof patch.startTime === 'number' ? { startTime: patch.startTime } : {}
      ),
  };
}

/** Returning to the initial geometry must not rewrite source anchors through a no-op command. */
export function isEffectDraftChanged(
  target: TimelineEffectDragTarget,
  range: Omit<TimelineEffectDragDraft, 'segmentId'>
): boolean {
  const originalStart = target.originalStart;
  const originalDuration =
    target.kind === 'motion'
      ? target.originalDuration
      : target.kind === 'cursor'
        ? target.originalEnd - target.originalStart
        : undefined;
  return (
    (range.startTime !== undefined && Math.abs(range.startTime - originalStart) > 1e-9) ||
    (range.duration !== undefined &&
      originalDuration !== undefined &&
      Math.abs(range.duration - originalDuration) > 1e-9)
  );
}

/** Display uses composition semantics while the deferred command keeps its authored values. */
export function resolveEffectDisplayDraft(
  _project: VideoProject,
  target: TimelineEffectDragTarget,
  range: Omit<TimelineEffectDragDraft, 'segmentId'>
): TimelineEffectDragDraft {
  const draft = { segmentId: target.segmentId, ...range };
  if (target.kind === 'cursor') {
    const startTime = range.startTime ?? target.originalStart;
    return {
      ...draft,
      cursorSampleTimes: {
        sampleId: target.sampleId,
        nextSampleId: target.nextSampleId,
        startTime,
        endTime:
          target.nextSampleId === null
            ? null
            : startTime + (range.duration ?? target.originalEnd - target.originalStart),
      },
    };
  }
  return draft;
}
