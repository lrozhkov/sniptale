import type React from 'react';
import { resolveClipLogicalLaneId } from '../../../../features/video/project/timeline';
import type { VideoProjectClip } from '../../../../features/video/project/types';
import { resolveTrackPlacementFromClientY } from '../tracks/layout';
import type { buildTimelineTrackLayoutModel } from '../tracks/layout';
import type { TimelineClipDragGhost, TimelineInteraction } from '../types';

export type MoveClipHandler = (
  clipId: string,
  startTime: number,
  trackId?: string,
  timelineLaneId?: string | null
) => void;

interface TimelineDragMoveParams {
  interaction: TimelineInteraction;
  moveEvent: PointerEvent;
  pixelsPerSecond: number;
  trackLayoutModel: ReturnType<typeof buildTimelineTrackLayoutModel>;
  onMoveClip: MoveClipHandler;
  setDragGhost: React.Dispatch<React.SetStateAction<TimelineClipDragGhost | null>>;
  onTrimClipEnd: (clipId: string, nextEndTime: number) => void;
  onTrimClipStart: (clipId: string, nextStartTime: number) => void;
}

const CLIP_LANE_CHANGE_INTENT_THRESHOLD_PX = 24;

export function applyTimelineDragMove({
  interaction,
  moveEvent,
  pixelsPerSecond,
  trackLayoutModel,
  onMoveClip,
  setDragGhost,
  onTrimClipEnd,
  onTrimClipStart,
}: TimelineDragMoveParams) {
  const deltaSeconds = (moveEvent.clientX - interaction.startClientX) / pixelsPerSecond;
  if (interaction.mode === 'move') {
    applyTimelineClipMove({
      clip: interaction.clip,
      deltaSeconds,
      interaction,
      moveEvent,
      onMoveClip,
      setDragGhost,
      trackLayoutModel,
    });
    return;
  }

  if (interaction.mode === 'trim-start') {
    setDragGhost(null);
    onTrimClipStart(interaction.clip.id, interaction.originalStart + deltaSeconds);
    return;
  }

  setDragGhost(null);
  onTrimClipEnd(interaction.clip.id, interaction.originalEnd + deltaSeconds);
}

function applyTimelineClipMove({
  clip,
  deltaSeconds,
  interaction,
  moveEvent,
  onMoveClip,
  setDragGhost,
  trackLayoutModel,
}: Pick<
  TimelineDragMoveParams,
  'interaction' | 'moveEvent' | 'onMoveClip' | 'setDragGhost' | 'trackLayoutModel'
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
  const startTime = Math.max(0, interaction.originalStart + deltaSeconds);
  setDragGhost({
    clipId: clip.id,
    duration: clip.duration,
    name: clip.name,
    startTime,
    timelineLaneId: targetPlacement?.timelineLaneId ?? null,
    trackId: targetPlacement?.trackId ?? clip.trackId,
  });
  onMoveClip(clip.id, startTime, targetPlacement?.trackId, targetPlacement?.timelineLaneId);
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
