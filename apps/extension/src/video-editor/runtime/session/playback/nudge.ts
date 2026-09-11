import { resolveVideoCompositionFrame } from '../../../../features/video/composition/timeline/frame';
import {
  mapScenePointToVideoActionOccurrence,
  mapVideoActionOccurrencePointToScene,
} from '../../../../features/video/composition/action-occurrence-geometry';
import {
  buildDraggedArea,
  clampStagePoint,
  getProjectCenter,
} from '../../../interaction/placement-geometry';
import { updateMotionArea } from '../../../interaction/motion-area';
import { VideoMotionFocusMode } from '../../../../features/video/project/types/index';
import { VideoEditorSelectionKind } from '../../../contracts/selection';
import type { PlaybackHandlers, PlaybackLatestState } from '../../../interaction/playback/types';

interface PlaybackSelectionNudge {
  deltaX: number;
  deltaY: number;
}

export function resolvePlaybackSelectionNudge(
  code: string,
  shiftKey: boolean,
  modifiers: { ctrlKey: boolean; metaKey: boolean; altKey: boolean }
): PlaybackSelectionNudge | null {
  if (modifiers.ctrlKey || modifiers.metaKey || modifiers.altKey) {
    return null;
  }

  const step = shiftKey ? 5 : 1;

  switch (code) {
    case 'ArrowLeft':
      return { deltaX: -step, deltaY: 0 };
    case 'ArrowRight':
      return { deltaX: step, deltaY: 0 };
    case 'ArrowUp':
      return { deltaX: 0, deltaY: -step };
    case 'ArrowDown':
      return { deltaX: 0, deltaY: step };
    default:
      return null;
  }
}

export function applyPlaybackSelectionNudge(
  latestState: PlaybackLatestState,
  handlers: PlaybackHandlers,
  nudge: PlaybackSelectionNudge
): boolean {
  const { deltaX, deltaY } = nudge;

  switch (latestState.selection.kind) {
    case VideoEditorSelectionKind.CLIP:
      return nudgeSelectedClip(latestState, handlers, deltaX, deltaY);
    case VideoEditorSelectionKind.ACTION_OCCURRENCE:
      return nudgeSelectedActionPoint(latestState, handlers, deltaX, deltaY);
    case VideoEditorSelectionKind.MOTION_REGION:
      return nudgeSelectedMotionRegion(latestState, handlers, deltaX, deltaY);
    case VideoEditorSelectionKind.EFFECT_INSTANCE:
    case VideoEditorSelectionKind.CLIP_GROUP:
    case VideoEditorSelectionKind.HISTORY_SPAN:
    case VideoEditorSelectionKind.HISTORY_LANE:
    case VideoEditorSelectionKind.MOTION_LANE:
    case VideoEditorSelectionKind.MOTION_CONNECTION:
    case VideoEditorSelectionKind.SCENE:
    case VideoEditorSelectionKind.TRACK:
    case VideoEditorSelectionKind.TRANSITION_JUNCTION:
    case VideoEditorSelectionKind.CURSOR_SEGMENT:
    case VideoEditorSelectionKind.OBJECT_TRACK:
      return false;
  }
}

function nudgeSelectedClip(
  latestState: PlaybackLatestState,
  handlers: PlaybackHandlers,
  deltaX: number,
  deltaY: number
): boolean {
  const clip =
    latestState.selectedClipId === null
      ? null
      : (latestState.project?.clips.find((item) => item.id === latestState.selectedClipId) ?? null);
  if (!clip) {
    return false;
  }

  handlers.updateClipTransform(clip.id, {
    x: clip.transform.x + deltaX,
    y: clip.transform.y + deltaY,
  });
  return true;
}

function nudgeSelectedActionPoint(
  latestState: PlaybackLatestState,
  handlers: PlaybackHandlers,
  deltaX: number,
  deltaY: number
): boolean {
  const { project, selectedActionOccurrence } = latestState;
  if (!project || !selectedActionOccurrence) {
    return false;
  }

  const camera = resolveVideoCompositionFrame(project, latestState.currentTime).camera;
  const point = mapVideoActionOccurrencePointToScene(
    project,
    selectedActionOccurrence,
    latestState.currentTime,
    camera
  );
  if (!point) return false;
  const mapped = mapScenePointToVideoActionOccurrence(
    project,
    selectedActionOccurrence,
    latestState.currentTime,
    camera,
    {
      x: point.x + deltaX / camera.scale,
      y: point.y + deltaY / camera.scale,
    }
  );
  if (!mapped) return false;
  handlers.updateActionEventDetails(selectedActionOccurrence.eventId, {
    point: mapped,
    clipId: selectedActionOccurrence.clipId,
  });
  return true;
}

function nudgeSelectedMotionRegion(
  latestState: PlaybackLatestState,
  handlers: PlaybackHandlers,
  deltaX: number,
  deltaY: number
): boolean {
  const { project, selectedMotionRegion } = latestState;
  if (!project || !selectedMotionRegion) {
    return false;
  }

  if (selectedMotionRegion.focusMode === VideoMotionFocusMode.MANUAL_AREA) {
    if (!selectedMotionRegion.focusArea) {
      return false;
    }

    updateMotionArea(
      selectedMotionRegion.id,
      buildDraggedArea(selectedMotionRegion.focusArea, deltaX, deltaY, 'move'),
      handlers.updateMotionRegion
    );
    return true;
  }

  if (selectedMotionRegion.focusMode !== VideoMotionFocusMode.MANUAL) {
    return false;
  }

  const point = selectedMotionRegion.focusPoint ?? getProjectCenter(project);
  handlers.updateMotionRegion(selectedMotionRegion.id, {
    focusPoint: clampStagePoint(project, {
      x: point.x + deltaX,
      y: point.y + deltaY,
    }),
  });
  return true;
}
