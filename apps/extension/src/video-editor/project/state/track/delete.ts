import { createSceneSelection } from '../../selection/model';
import { VideoEditorSelectionKind } from '../../../contracts/selection';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { normalizeTrackOrder } from '../../../../features/video/project/timeline';
import type { VideoProject } from '../../../../features/video/project/types/index';
import type { VideoEditorProjectState } from '../contracts';

function canDeleteProjectTrack(project: VideoProject, trackId: string): boolean {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track) {
    return false;
  }

  return !track.isRoot;
}

export function deleteProjectTrack(project: VideoProject, trackId: string): VideoProject {
  if (!canDeleteProjectTrack(project, trackId)) {
    return project;
  }

  return normalizeTrackOrder(
    applyVideoProjectMutationPatch(project, {
      clips: project.clips.filter((clip) => clip.trackId !== trackId),
      tracks: project.tracks.filter((track) => track.id !== trackId),
    })
  );
}

function resolveRemovedSelectedClip(state: VideoEditorProjectState, trackId: string): boolean {
  const currentSelection = state.selection;
  if (currentSelection.kind !== VideoEditorSelectionKind.CLIP) {
    return false;
  }

  return (
    state.project?.clips.find((clip) => clip.id === currentSelection.clipId)?.trackId === trackId
  );
}

export function resolveSelectionAfterTrackDelete(
  state: VideoEditorProjectState,
  trackId: string,
  selectedTrackId: string | null
) {
  if (
    state.selection.kind === VideoEditorSelectionKind.TRACK &&
    state.selection.trackId === trackId
  ) {
    return selectedTrackId
      ? { kind: VideoEditorSelectionKind.TRACK, trackId: selectedTrackId }
      : createSceneSelection();
  }

  return resolveRemovedSelectedClip(state, trackId) ? createSceneSelection() : state.selection;
}
