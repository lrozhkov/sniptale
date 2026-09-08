import { resolveVideoProjectActionOccurrences } from '../../../features/video/project/action-occurrences';
import type { VideoProject } from '../../../features/video/project/types/index';
import { VideoMotionFocusMode } from '../../../features/video/project/types/index';
import {
  VideoEditorPlacementModeKind,
  type VideoEditorPlacementMode,
} from '../../contracts/placement';
import { VideoEditorSelectionKind, type VideoEditorSelection } from '../../contracts/selection';

export function createActionPointPlacementMode(
  eventId: string,
  clipId: string | null
): VideoEditorPlacementMode {
  return {
    kind: VideoEditorPlacementModeKind.ACTION_POINT,
    eventId,
    clipId,
  };
}

export function createMotionFocusPlacementMode(motionRegionId: string): VideoEditorPlacementMode {
  return {
    kind: VideoEditorPlacementModeKind.MOTION_FOCUS,
    motionRegionId,
  };
}

export function createMotionAreaPlacementMode(motionRegionId: string): VideoEditorPlacementMode {
  return {
    kind: VideoEditorPlacementModeKind.MOTION_AREA,
    motionRegionId,
  };
}

export function createObjectTrackAnchorPlacementMode(
  objectTrackId: string
): VideoEditorPlacementMode {
  return {
    kind: VideoEditorPlacementModeKind.OBJECT_TRACK_ANCHOR,
    objectTrackId,
  };
}

export function resolvePlacementModeAfterSelectionChange(
  selection: VideoEditorSelection,
  placementMode: VideoEditorPlacementMode | null
): VideoEditorPlacementMode | null {
  if (!placementMode) {
    return null;
  }

  switch (placementMode.kind) {
    case VideoEditorPlacementModeKind.ACTION_POINT:
      return selection.kind === VideoEditorSelectionKind.ACTION_OCCURRENCE &&
        selection.eventId === placementMode.eventId &&
        selection.clipId === placementMode.clipId
        ? placementMode
        : null;
    case VideoEditorPlacementModeKind.MOTION_FOCUS:
    case VideoEditorPlacementModeKind.MOTION_AREA:
      return selection.kind === VideoEditorSelectionKind.MOTION_REGION &&
        selection.motionRegionId === placementMode.motionRegionId
        ? placementMode
        : null;
    case VideoEditorPlacementModeKind.OBJECT_TRACK_ANCHOR:
      return selection.kind === VideoEditorSelectionKind.OBJECT_TRACK &&
        selection.objectTrackId === placementMode.objectTrackId
        ? placementMode
        : null;
  }
}

export function resolvePlacementModeAfterProjectUpdate(
  project: VideoProject,
  placementMode: VideoEditorPlacementMode | null
): VideoEditorPlacementMode | null {
  if (!placementMode) {
    return null;
  }

  switch (placementMode.kind) {
    case VideoEditorPlacementModeKind.ACTION_POINT:
      return resolveVideoProjectActionOccurrences(project).some(
        (item) => item.eventId === placementMode.eventId && item.clipId === placementMode.clipId
      )
        ? placementMode
        : null;
    case VideoEditorPlacementModeKind.MOTION_FOCUS:
      return (project.motionRegions ?? []).some(
        (region) =>
          region.id === placementMode.motionRegionId &&
          region.focusMode === VideoMotionFocusMode.MANUAL
      )
        ? placementMode
        : null;
    case VideoEditorPlacementModeKind.MOTION_AREA:
      return (project.motionRegions ?? []).some(
        (region) =>
          region.id === placementMode.motionRegionId &&
          region.focusMode === VideoMotionFocusMode.MANUAL_AREA
      )
        ? placementMode
        : null;

    case VideoEditorPlacementModeKind.OBJECT_TRACK_ANCHOR:
      return (project.objectTracks ?? []).some((track) => track.id === placementMode.objectTrackId)
        ? placementMode
        : null;
  }
}
