import { resolveVideoProjectActionOccurrences } from '../../../features/video/project/action-occurrences';
import { createSceneSelection } from '../selection/model';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import type { VideoEditorProjectState } from './contracts';
import type { VideoProject } from '../../../features/video/project/types/index';
import { resolveMotionConnectionSource } from '../../../features/video/project/motion';
import { isRecordingSourceTimedClip } from '../operations/source-timed-clips';

export function resolveSelectionAfterProjectUpdate(
  project: VideoProject,
  selection: VideoEditorProjectState['selection'],
  splitLineage?: ReadonlyMap<string, string>
): VideoEditorProjectState['selection'] {
  switch (selection.kind) {
    case VideoEditorSelectionKind.HISTORY_SPAN: {
      const clip = project.clips.find((item) => item.id === selection.clipId);
      return clip?.type === 'VIDEO' &&
        clip.sourceInstanceId === selection.sourceInstanceId &&
        isRecordingSourceTimedClip(project, clip, selection.recordingId)
        ? selection
        : { kind: VideoEditorSelectionKind.HISTORY_LANE };
    }
    case VideoEditorSelectionKind.MOTION_CONNECTION: {
      const destination = project.motionRegions?.find(
        (region) => region.id === selection.motionRegionId
      );
      return destination && resolveMotionConnectionSource(project, destination)
        ? selection
        : createSceneSelection();
    }
    case VideoEditorSelectionKind.HISTORY_LANE:
    case VideoEditorSelectionKind.SCENE:
      return selection;
    case VideoEditorSelectionKind.MOTION_LANE:
      return (project.motionRegions?.length ?? 0) > 0 ? selection : createSceneSelection();
    case VideoEditorSelectionKind.CLIP_GROUP: {
      const clipIds = selection.clipIds.filter((id) =>
        project.clips.some((clip) => clip.id === id)
      );
      if (clipIds.length === 0) return createSceneSelection();
      if (clipIds.length === 1) return { kind: VideoEditorSelectionKind.CLIP, clipId: clipIds[0]! };
      return {
        ...selection,
        clipIds,
        anchorClipId: clipIds.includes(selection.anchorClipId)
          ? selection.anchorClipId
          : clipIds[0]!,
      };
    }
    case VideoEditorSelectionKind.CLIP:
      return project.clips.some((clip) => clip.id === selection.clipId)
        ? selection
        : createSceneSelection();
    case VideoEditorSelectionKind.TRACK:
      return project.tracks.some((track) => track.id === selection.trackId)
        ? selection
        : createSceneSelection();
    case VideoEditorSelectionKind.TRANSITION_JUNCTION:
      return (project.transitions ?? []).some(
        (transition) => transition.id === selection.transitionId
      )
        ? selection
        : createSceneSelection();
    case VideoEditorSelectionKind.CURSOR_SEGMENT:
      return project.cursorTrack?.samples.some((sample) => sample.id === selection.sampleId)
        ? selection
        : createSceneSelection();
    case VideoEditorSelectionKind.OBJECT_TRACK:
      return (project.objectTracks ?? []).some((track) => track.id === selection.objectTrackId)
        ? selection
        : createSceneSelection();
    case VideoEditorSelectionKind.ACTION_OCCURRENCE: {
      const occurrences = resolveVideoProjectActionOccurrences(project);
      if (
        occurrences.some(
          (item) => item.eventId === selection.eventId && item.clipId === selection.clipId
        )
      )
        return selection;
      const descendantId = selection.clipId ? splitLineage?.get(selection.clipId) : undefined;
      return descendantId &&
        occurrences.some(
          (item) => item.eventId === selection.eventId && item.clipId === descendantId
        )
        ? { ...selection, clipId: descendantId }
        : { kind: VideoEditorSelectionKind.HISTORY_LANE };
    }
    case VideoEditorSelectionKind.MOTION_REGION:
      return (project.motionRegions ?? []).some((region) => region.id === selection.motionRegionId)
        ? selection
        : createSceneSelection();
  }
}

export function resolveSelectedTrackIdFromSelection(
  project: VideoProject,
  selection: VideoEditorProjectState['selection']
): string | null {
  switch (selection.kind) {
    case VideoEditorSelectionKind.MOTION_CONNECTION:
    case VideoEditorSelectionKind.HISTORY_LANE:
    case VideoEditorSelectionKind.HISTORY_SPAN:
    case VideoEditorSelectionKind.SCENE:
    case VideoEditorSelectionKind.MOTION_LANE:
    case VideoEditorSelectionKind.CLIP_GROUP:
    case VideoEditorSelectionKind.CURSOR_SEGMENT:
    case VideoEditorSelectionKind.OBJECT_TRACK:
    case VideoEditorSelectionKind.ACTION_OCCURRENCE:
    case VideoEditorSelectionKind.MOTION_REGION:
      return null;
    case VideoEditorSelectionKind.CLIP:
      return project.clips.find((clip) => clip.id === selection.clipId)?.trackId ?? null;
    case VideoEditorSelectionKind.TRACK:
      return selection.trackId;
    case VideoEditorSelectionKind.TRANSITION_JUNCTION: {
      const transition = (project.transitions ?? []).find(
        (item) => item.id === selection.transitionId
      );
      if (!transition) {
        return null;
      }

      return (
        project.clips.find((clip) => clip.id === transition.leadingClipId)?.trackId ??
        project.clips.find((clip) => clip.id === transition.trailingClipId)?.trackId ??
        null
      );
    }
  }
}
