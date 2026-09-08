import { useMemo } from 'react';
import { getProjectTransitionById } from '../../../features/video/project/transition/project';
import type {
  VideoProject,
  VideoProjectClip,
  VideoProjectCursorSample,
  VideoProjectMotionRegion,
  VideoProjectTrack,
  VideoProjectTransition,
} from '../../../features/video/project/types/index';
import {
  resolveVideoProjectActionOccurrences,
  type VideoProjectActionOccurrence,
} from '../../../features/video/project/action-occurrences';
import type { VideoObjectTrack } from '../../../features/video/project/object-tracks';
import { VideoEditorSelectionKind, type VideoEditorSelection } from '../../contracts/selection';
import {
  isVideoEditorPresentedClip,
  isVideoEditorPresentedTrack,
} from '../../project/operations/presented-tracks';

export interface VideoEditorSelections {
  selection: VideoEditorSelection;
  selectedClip: VideoProjectClip | null;
  selectedTrack: VideoProjectTrack | null;
  selectedActionOccurrence: VideoProjectActionOccurrence | null;
  selectedCursorSample: VideoProjectCursorSample | null;
  selectedTransition: VideoProjectTransition | null;
  selectedMotionRegion: VideoProjectMotionRegion | null;
  selectedObjectTrack: VideoObjectTrack | null;
}

function useSelectedTransition(project: VideoProject | null, selection: VideoEditorSelection) {
  return useMemo(
    () =>
      selection.kind === VideoEditorSelectionKind.TRANSITION_JUNCTION && project
        ? getProjectTransitionById(project, selection.transitionId)
        : null,
    [project, selection]
  );
}

function useSelectedCursorSample(project: VideoProject | null, selection: VideoEditorSelection) {
  return useMemo(
    () =>
      selection.kind === VideoEditorSelectionKind.CURSOR_SEGMENT
        ? (project?.cursorTrack?.samples.find((sample) => sample.id === selection.sampleId) ?? null)
        : null,
    [project, selection]
  );
}

function useSelectedActionOccurrence(
  project: VideoProject | null,
  selection: VideoEditorSelection
) {
  return useMemo(
    () =>
      selection.kind === VideoEditorSelectionKind.ACTION_OCCURRENCE
        ? project
          ? (resolveVideoProjectActionOccurrences(project).find(
              (item) => item.eventId === selection.eventId && item.clipId === selection.clipId
            ) ?? null)
          : null
        : null,
    [project, selection]
  );
}

function useSelectedMotionRegion(project: VideoProject | null, selection: VideoEditorSelection) {
  return useMemo(
    () =>
      selection.kind === VideoEditorSelectionKind.MOTION_REGION
        ? (project?.motionRegions?.find((region) => region.id === selection.motionRegionId) ?? null)
        : null,
    [project, selection]
  );
}

function useSelectedObjectTrack(project: VideoProject | null, selection: VideoEditorSelection) {
  return useMemo(
    () =>
      selection.kind === VideoEditorSelectionKind.OBJECT_TRACK
        ? ((project?.objectTracks ?? []).find((track) => track.id === selection.objectTrackId) ??
          null)
        : null,
    [project, selection]
  );
}

/**
 * Derives the currently selected clip and track from the active project snapshot.
 */
export function useVideoEditorSelections(
  project: VideoProject | null,
  selection: VideoEditorSelection,
  selectedClipId: string | null,
  selectedTrackId: string | null
): VideoEditorSelections {
  const selectedClip = useMemo(
    () =>
      project
        ? (project.clips.find(
            (clip) => clip.id === selectedClipId && isVideoEditorPresentedClip(project, clip)
          ) ?? null)
        : null,
    [project, selectedClipId]
  );
  const selectedTrack = useMemo(
    () =>
      project?.tracks.find(
        (track) => track.id === selectedTrackId && isVideoEditorPresentedTrack(track)
      ) ?? null,
    [project, selectedTrackId]
  );
  const selectedTransition = useSelectedTransition(project, selection);
  const selectedCursorSample = useSelectedCursorSample(project, selection);
  const selectedActionOccurrence = useSelectedActionOccurrence(project, selection);
  const selectedMotionRegion = useSelectedMotionRegion(project, selection);
  const selectedObjectTrack = useSelectedObjectTrack(project, selection);

  return useMemo(
    () => ({
      selection,
      selectedActionOccurrence,
      selectedClip,
      selectedCursorSample,
      selectedMotionRegion,
      selectedObjectTrack,
      selectedTrack,
      selectedTransition,
    }),
    [
      selection,
      selectedActionOccurrence,
      selectedClip,
      selectedCursorSample,
      selectedMotionRegion,
      selectedObjectTrack,
      selectedTrack,
      selectedTransition,
    ]
  );
}
