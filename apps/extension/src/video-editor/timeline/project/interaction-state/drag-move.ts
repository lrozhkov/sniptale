import type React from 'react';
import {
  moveProjectClip,
  trimProjectClipStart,
  trimProjectClipEnd,
} from '../../../project/state/clip-timeline/mutations';
import { resolveClipLogicalLaneId } from '../../../../features/video/project/timeline';
import type { VideoProject, VideoProjectClip } from '../../../../features/video/project/types';
import { resolveTrackPlacementFromClientY } from '../tracks/layout';
import type { buildTimelineTrackLayoutModel } from '../tracks/layout';
import type { TimelineClipDragGhost, TimelineInteraction } from '../types';
import { resolveTimelineSnap } from '../effect-lanes/snap';
import type {
  VideoEditorMoveClipAction,
  VideoEditorClipTimingResult,
  VideoEditorTrimClipAction,
} from '../../../contracts/commands/timeline';

type DragTimingResult = VideoEditorClipTimingResult & Pick<TimelineClipDragGhost, 'relatedClips'>;

export type MoveClipHandler = (
  ...args: Parameters<VideoEditorMoveClipAction>
) => DragTimingResult | null | void;
export type TrimClipHandler = (
  ...args: Parameters<VideoEditorTrimClipAction>
) => DragTimingResult | null | void;

interface TimelineDragMoveParams {
  interaction: TimelineInteraction;
  currentTime: number;
  magnetEnabled: boolean;
  moveEvent: PointerEvent;
  pixelsPerSecond: number;
  trackLayoutModel: ReturnType<typeof buildTimelineTrackLayoutModel>;
  onMoveClip: MoveClipHandler;
  setDragGhost: React.Dispatch<React.SetStateAction<TimelineClipDragGhost | null>>;
  onTrimClipEnd: TrimClipHandler;
  onTrimClipStart: TrimClipHandler;
  project: VideoProject;
  setSnapGuideTime: React.Dispatch<React.SetStateAction<number | null>>;
}

const CLIP_LANE_CHANGE_INTENT_THRESHOLD_PX = 24;

/** Projects a gesture through the same mutation owner as its eventual command. */
export function createTimelineDragDraft(
  params: Pick<
    TimelineDragMoveParams,
    'project' | 'onMoveClip' | 'onTrimClipStart' | 'onTrimClipEnd'
  >
) {
  let commit: (() => void) | null = null;
  const preview = (project: VideoProject, clipId: string, action: () => void) => {
    commit = action;
    const clip = project.clips.find((item) => item.id === clipId);
    return clip
      ? {
          clipId,
          duration: clip.duration,
          startTime: clip.startTime,
          endTime: clip.startTime + clip.duration,
          trackId: clip.trackId,
          timelineLaneId: clip.timelineLaneId ?? null,
          relatedClips: getChangedCompanionPreviews(params.project, project, clipId),
        }
      : null;
  };
  return {
    commit: () => commit?.(),
    onMoveClip: (...args: Parameters<MoveClipHandler>) =>
      preview(moveProjectClip(params.project, ...args), args[0], () => params.onMoveClip(...args)),
    onTrimClipStart: (...args: Parameters<TrimClipHandler>) =>
      preview(trimProjectClipStart(params.project, ...args), args[0], () =>
        params.onTrimClipStart(...args)
      ),
    onTrimClipEnd: (...args: Parameters<TrimClipHandler>) =>
      preview(trimProjectClipEnd(params.project, ...args), args[0], () =>
        params.onTrimClipEnd(...args)
      ),
  };
}

function getChangedCompanionPreviews(
  before: VideoProject,
  after: VideoProject,
  selectedId: string
) {
  const original = new Map(before.clips.map((clip) => [clip.id, clip]));
  return after.clips
    .filter((clip) => {
      const previous = original.get(clip.id);
      return (
        clip.id !== selectedId &&
        previous &&
        (clip.startTime !== previous.startTime ||
          clip.duration !== previous.duration ||
          clip.trackId !== previous.trackId ||
          resolveClipLogicalLaneId(clip) !== resolveClipLogicalLaneId(previous))
      );
    })
    .map((clip) => ({
      clipId: clip.id,
      duration: clip.duration,
      name: clip.name,
      startTime: clip.startTime,
      trackId: clip.trackId,
      timelineLaneId: clip.timelineLaneId ?? null,
    }));
}

export function applyTimelineDragMove({
  interaction,
  currentTime,
  magnetEnabled,
  moveEvent,
  pixelsPerSecond,
  trackLayoutModel,
  onMoveClip,
  setDragGhost,
  onTrimClipEnd,
  onTrimClipStart,
  project,
  setSnapGuideTime,
}: TimelineDragMoveParams) {
  const deltaSeconds = (moveEvent.clientX - interaction.startClientX) / pixelsPerSecond;
  if (interaction.mode === 'move') {
    applyTimelineClipMove({
      clip: interaction.clip,
      deltaSeconds,
      interaction,
      currentTime,
      magnetEnabled: magnetEnabled && !moveEvent.altKey,
      moveEvent,
      onMoveClip,
      pixelsPerSecond,
      project,
      setDragGhost,
      setSnapGuideTime,
      trackLayoutModel,
    });
    return;
  }

  if (interaction.mode === 'trim-start') {
    setDragGhost(null);
    const result = resolveClipEdgeSnap({
      clipId: interaction.clip.id,
      currentTime,
      magnetEnabled: magnetEnabled && !moveEvent.altKey,
      pixelsPerSecond,
      project,
      time: interaction.originalStart + deltaSeconds,
    });
    const applied = onTrimClipStart(interaction.clip.id, result.time);
    if (applied) setDragGhost({ ...applied, name: interaction.clip.name });
    setSnapGuideTime(resolveAppliedSnapGuide(result.targetTime, applied?.startTime ?? result.time));
    return;
  }

  setDragGhost(null);
  const result = resolveClipEdgeSnap({
    clipId: interaction.clip.id,
    currentTime,
    magnetEnabled: magnetEnabled && !moveEvent.altKey,
    pixelsPerSecond,
    project,
    time: interaction.originalEnd + deltaSeconds,
  });
  const applied = onTrimClipEnd(interaction.clip.id, result.time);
  if (applied) setDragGhost({ ...applied, name: interaction.clip.name });
  setSnapGuideTime(resolveAppliedSnapGuide(result.targetTime, applied?.endTime ?? result.time));
}

function applyTimelineClipMove({
  clip,
  deltaSeconds,
  interaction,
  currentTime,
  magnetEnabled,
  moveEvent,
  onMoveClip,
  pixelsPerSecond,
  project,
  setDragGhost,
  setSnapGuideTime,
  trackLayoutModel,
}: Pick<
  TimelineDragMoveParams,
  | 'currentTime'
  | 'interaction'
  | 'magnetEnabled'
  | 'moveEvent'
  | 'onMoveClip'
  | 'pixelsPerSecond'
  | 'project'
  | 'setDragGhost'
  | 'setSnapGuideTime'
  | 'trackLayoutModel'
> & {
  clip: VideoProjectClip;
  deltaSeconds: number;
}) {
  const targetPlacement = resolveClipDragTargetPlacement({
    clip,
    interaction,
    moveEvent,
    trackLayoutModel,
  });
  const rawStartTime = Math.max(0, interaction.originalStart + deltaSeconds);
  const snapResult = resolveMovingClipSnap({
    clip,
    currentTime,
    magnetEnabled,
    pixelsPerSecond,
    project,
    rawStartTime,
  });
  const applied = onMoveClip(
    clip.id,
    snapResult.time,
    targetPlacement?.trackId,
    targetPlacement?.timelineLaneId
  );
  const startTime = applied?.startTime ?? snapResult.time;
  const duration = applied?.duration ?? clip.duration;
  const trackId = applied?.trackId ?? targetPlacement?.trackId ?? clip.trackId;
  const timelineLaneId = applied?.timelineLaneId ?? targetPlacement?.timelineLaneId ?? null;
  setSnapGuideTime(
    resolveAppliedSnapGuide(
      snapResult.targetTime,
      snapResult.targetTime === null
        ? null
        : nearestAppliedClipEdge(snapResult.targetTime, startTime, startTime + duration)
    )
  );
  setDragGhost({
    clipId: clip.id,
    duration,
    name: clip.name,
    startTime,
    timelineLaneId,
    trackId,
    ...(applied?.relatedClips ? { relatedClips: applied.relatedClips } : {}),
  });
}

function nearestAppliedClipEdge(targetTime: number, startTime: number, endTime: number): number {
  return Math.abs(startTime - targetTime) <= Math.abs(endTime - targetTime) ? startTime : endTime;
}

function resolveAppliedSnapGuide(targetTime: number | null, appliedEdgeTime: number | null) {
  const tolerance =
    Number.EPSILON * 16 * Math.max(1, Math.abs(targetTime ?? 0), Math.abs(appliedEdgeTime ?? 0));
  return targetTime !== null &&
    appliedEdgeTime !== null &&
    Math.abs(targetTime - appliedEdgeTime) <= tolerance
    ? targetTime
    : null;
}

function resolveClipEdgeSnap(params: {
  clipId: string;
  currentTime: number;
  magnetEnabled: boolean;
  pixelsPerSecond: number;
  project: VideoProject;
  time: number;
}) {
  if (!params.magnetEnabled) return { targetTime: null, time: params.time };
  return resolveTimelineSnap(params.time, params.project, params.pixelsPerSecond, {
    additionalTimes: [params.currentTime],
    excludedClipId: params.clipId,
    includeMotionRegions: false,
  });
}

function resolveMovingClipSnap(params: {
  clip: VideoProjectClip;
  currentTime: number;
  magnetEnabled: boolean;
  pixelsPerSecond: number;
  project: VideoProject;
  rawStartTime: number;
}) {
  if (!params.magnetEnabled) return { targetTime: null, time: params.rawStartTime };
  const options = {
    additionalTimes: [params.currentTime],
    excludedClipId: params.clip.id,
    includeMotionRegions: false,
  };
  const start = resolveTimelineSnap(
    params.rawStartTime,
    params.project,
    params.pixelsPerSecond,
    options
  );
  const rawEndTime = params.rawStartTime + params.clip.duration;
  const end = resolveTimelineSnap(rawEndTime, params.project, params.pixelsPerSecond, options);
  const startCorrection = Math.abs(start.time - params.rawStartTime);
  const endCorrection = Math.abs(end.time - rawEndTime);
  if (end.targetTime !== null && (start.targetTime === null || endCorrection < startCorrection)) {
    return { targetTime: end.targetTime, time: Math.max(0, end.time - params.clip.duration) };
  }
  return start;
}

function resolveClipDragTargetPlacement({
  clip,
  interaction,
  moveEvent,
  trackLayoutModel,
}: Pick<TimelineDragMoveParams, 'interaction' | 'moveEvent' | 'trackLayoutModel'> & {
  clip: VideoProjectClip;
}) {
  const deltaClientY = moveEvent.clientY - interaction.startClientY;
  if (Math.abs(deltaClientY) < CLIP_LANE_CHANGE_INTENT_THRESHOLD_PX) {
    return {
      timelineLaneId: resolveClipLogicalLaneId(clip),
      trackId: interaction.originalTrackId,
    };
  }

  return resolveTrackPlacementFromClientY({
    currentClientY: moveEvent.clientY,
    layoutModel: trackLayoutModel,
    originalClientY: interaction.startClientY,
    originalTimelineLaneId: resolveClipLogicalLaneId(clip),
    originalTrackId: interaction.originalTrackId,
  });
}
