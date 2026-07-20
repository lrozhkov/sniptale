import { createSceneSelection } from '../selection/model';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import type { VideoEditorProjectState } from './contracts';
import type { VideoProject } from '../../../features/video/project/types/index';

export function resolveSelectionAfterProjectUpdate(
  project: VideoProject,
  selection: VideoEditorProjectState['selection']
): VideoEditorProjectState['selection'] {
  switch (selection.kind) {
    case VideoEditorSelectionKind.SCENE:
      return selection;
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
    case VideoEditorSelectionKind.ACTION_SEGMENT:
      return project.actionEvents.some((event) => event.id === selection.actionEventId)
        ? selection
        : createSceneSelection();
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
    case VideoEditorSelectionKind.SCENE:
    case VideoEditorSelectionKind.CURSOR_SEGMENT:
    case VideoEditorSelectionKind.OBJECT_TRACK:
    case VideoEditorSelectionKind.ACTION_SEGMENT:
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
