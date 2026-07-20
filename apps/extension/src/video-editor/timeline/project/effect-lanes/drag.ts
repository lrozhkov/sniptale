import { clampNumber } from '../../../../features/video/project/hydration';
import type { VideoProject } from '../../../../features/video/project/types';
import type { ProjectTimelineProps, TimelineEffectDragTarget } from '../types';
import { snapTimelineTime } from './snap';

export interface EffectInteraction {
  startClientX: number;
  target: TimelineEffectDragTarget;
}

export interface EffectMoveCallbacks {
  onMoveActionEvent: ProjectTimelineProps['onMoveActionEvent'];
  onResizeActionEvent: ProjectTimelineProps['onResizeActionEvent'];
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
  callbacks.onResizeMotionRegion(
    target.motionRegionId,
    ...snapMotionRegionRange({
      duration,
      magnetEnabled,
      pixelsPerSecond,
      project,
      startTime,
      target,
    })
  );
}

export function moveEffectTarget(
  interaction: EffectInteraction,
  magnetEnabled: boolean,
  pixelsPerSecond: number,
  project: VideoProject,
  projectDuration: number,
  moveEvent: PointerEvent,
  callbacks: EffectMoveCallbacks
): void {
  const delta = (moveEvent.clientX - interaction.startClientX) / pixelsPerSecond;

  switch (interaction.target.kind) {
    case 'action':
      moveActionEventTarget(interaction.target, delta, projectDuration, callbacks);
      return;
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

function moveActionEventTarget(
  target: Extract<TimelineEffectDragTarget, { kind: 'action' }>,
  delta: number,
  projectDuration: number,
  callbacks: EffectMoveCallbacks
): void {
  if (target.mode === 'move') {
    callbacks.onMoveActionEvent(
      target.actionEventId,
      clampNumber(target.originalTime + delta, 0, projectDuration)
    );
    return;
  }

  callbacks.onResizeActionEvent(
    target.actionEventId,
    clampNumber(
      target.originalDuration + delta,
      0,
      Math.max(0, projectDuration - target.originalTime)
    )
  );
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
  if (!params.magnetEnabled) {
    return params.startTime;
  }

  const snappedStart = snapTimelineTime(params.startTime, params.project, params.pixelsPerSecond);
  return clampNumber(
    snappedStart,
    0,
    Math.max(0, params.projectDuration - params.target.originalDuration)
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
