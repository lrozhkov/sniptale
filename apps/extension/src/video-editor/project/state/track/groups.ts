import {
  createVideoProjectTrack,
  getDefaultTrackName,
} from '../../../../features/video/project/factories/creation';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { getSubtitleTrackStyle } from '../../../../features/video/project/text/subtitle-track';
import {
  createNextVideoProjectTrackLogicalLane,
  getVideoProjectTrackLogicalLaneIds,
} from '../../../../features/video/project/timeline/logical-lanes';
import { VideoTrackKind } from '../../../../features/video/project/types/index';
import type { VideoProject } from '../../../../features/video/project/types/index';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from '../contracts';
import { applyProjectUpdate } from '../helpers';
import {
  deleteProjectTrack,
  resolveSelectedClipIdAfterTrackDelete,
  resolveSelectionAfterTrackDelete,
} from './delete';
import {
  createUtilityLaneClearAction,
  createUtilityLaneLockToggle,
  createUtilityLaneVisibilityToggle,
} from './utility-lanes';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;

function addTrackToProject(project: VideoProject, kind: VideoTrackKind) {
  const sequence = project.tracks.filter((track) => track.kind === kind).length + 1;
  const track = createVideoProjectTrack(
    getDefaultTrackName(kind, sequence),
    project.tracks.length,
    kind
  );

  return applyVideoProjectMutationPatch(project, {
    tracks: [...project.tracks, track],
  });
}

function moveProjectTrack(project: VideoProject, trackId: string, direction: 'up' | 'down') {
  const tracks = [...project.tracks].sort((a, b) => a.order - b.order);
  const index = tracks.findIndex((track) => track.id === trackId);
  if (index < 0) {
    return project;
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= tracks.length) {
    return project;
  }

  const [track] = tracks.splice(index, 1);
  if (!track) {
    return project;
  }

  tracks.splice(targetIndex, 0, track);
  return applyVideoProjectMutationPatch(project, {
    tracks: tracks.map((item, order) => ({ ...item, order })),
  });
}

export function createProjectTrackStructureActions(
  set: VideoEditorStoreSet
): Pick<
  VideoEditorProjectState,
  | 'renameProject'
  | 'renameTrack'
  | 'updateSubtitleTrackStyle'
  | 'addTrackLogicalLane'
  | 'addTrack'
  | 'deleteTrack'
  | 'moveTrack'
> {
  return {
    renameProject: createRenameProjectAction(set),
    renameTrack: createRenameTrackAction(set),
    updateSubtitleTrackStyle: createSubtitleTrackStyleAction(set),
    addTrackLogicalLane: createAddTrackLogicalLaneAction(set),
    addTrack: createAddTrackAction(set),
    moveTrack: createMoveTrackAction(set),
    deleteTrack: createDeleteTrackAction(set),
  };
}

function createRenameProjectAction(
  set: VideoEditorStoreSet
): VideoEditorProjectState['renameProject'] {
  return (name) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        applyVideoProjectMutationPatch(project, {
          name,
        })
      )
    );
}

function createRenameTrackAction(set: VideoEditorStoreSet): VideoEditorProjectState['renameTrack'] {
  return (trackId, name) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        applyVideoProjectMutationPatch(project, {
          tracks: project.tracks.map((track) =>
            track.id === trackId ? { ...track, name } : track
          ),
        })
      )
    );
}

function createSubtitleTrackStyleAction(
  set: VideoEditorStoreSet
): VideoEditorProjectState['updateSubtitleTrackStyle'] {
  return (trackId, patch) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        applyVideoProjectMutationPatch(project, {
          tracks: project.tracks.map((track) =>
            track.id === trackId && track.kind === VideoTrackKind.SUBTITLE
              ? {
                  ...track,
                  subtitleStyle: {
                    ...getSubtitleTrackStyle(track),
                    ...patch,
                  },
                }
              : track
          ),
        })
      )
    );
}

function createAddTrackLogicalLaneAction(
  set: VideoEditorStoreSet
): VideoEditorProjectState['addTrackLogicalLane'] {
  return (trackId) =>
    set((state) =>
      applyProjectUpdate(state, (project) => {
        const targetTrack = project.tracks.find((track) => track.id === trackId);
        if (!targetTrack || targetTrack.locked) {
          return project;
        }

        const nextLane = createNextVideoProjectTrackLogicalLane(project, trackId);
        return applyVideoProjectMutationPatch(project, {
          tracks: project.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  logicalLanes: [
                    ...getVideoProjectTrackLogicalLaneIds(project, track.id).map((id) => ({ id })),
                    nextLane,
                  ],
                }
              : track
          ),
        });
      })
    );
}

function createAddTrackAction(set: VideoEditorStoreSet): VideoEditorProjectState['addTrack'] {
  return (kind = VideoTrackKind.OVERLAY) =>
    set((state) => {
      if (!state.project) {
        return {};
      }

      const nextProject = addTrackToProject(state.project, kind);
      const nextTrackId = nextProject.tracks[nextProject.tracks.length - 1]?.id ?? null;

      return {
        ...applyProjectUpdate(state, () => nextProject),
        selectedTrackId: nextTrackId,
        selectedClipId: null,
        selection: nextTrackId ? { kind: 'track', trackId: nextTrackId } : state.selection,
      };
    });
}

function createMoveTrackAction(set: VideoEditorStoreSet): VideoEditorProjectState['moveTrack'] {
  return (trackId, direction) =>
    set((state) =>
      applyProjectUpdate(state, (project) => moveProjectTrack(project, trackId, direction))
    );
}

function createDeleteTrackAction(set: VideoEditorStoreSet): VideoEditorProjectState['deleteTrack'] {
  return (trackId) =>
    set((state) => {
      if (!state.project) {
        return {};
      }

      const nextProject = deleteProjectTrack(state.project, trackId);
      if (nextProject === state.project) {
        return {};
      }

      const selectedTrackId = nextProject.tracks[0]?.id ?? null;

      return {
        ...applyProjectUpdate(state, () => nextProject),
        selectedClipId: resolveSelectedClipIdAfterTrackDelete(state, trackId),
        selectedTrackId:
          state.selectedTrackId === trackId ? selectedTrackId : state.selectedTrackId,
        selection: resolveSelectionAfterTrackDelete(state, trackId, selectedTrackId),
      };
    });
}

export function createProjectTrackToggleActions(
  set: VideoEditorStoreSet
): Pick<
  VideoEditorProjectState,
  | 'toggleTrackVisibility'
  | 'toggleTrackLock'
  | 'toggleUtilityLaneVisibility'
  | 'toggleUtilityLaneLock'
  | 'clearUtilityLane'
> {
  return {
    toggleTrackVisibility: (trackId) =>
      set((state) =>
        applyProjectUpdate(state, (project) =>
          applyVideoProjectMutationPatch(project, {
            tracks: project.tracks.map((track) =>
              track.id === trackId ? { ...track, visible: !track.visible } : track
            ),
          })
        )
      ),
    toggleTrackLock: (trackId) =>
      set((state) =>
        applyProjectUpdate(state, (project) =>
          applyVideoProjectMutationPatch(project, {
            tracks: project.tracks.map((track) =>
              track.id === trackId ? { ...track, locked: !track.locked } : track
            ),
          })
        )
      ),
    toggleUtilityLaneVisibility: createUtilityLaneVisibilityToggle(set),
    toggleUtilityLaneLock: createUtilityLaneLockToggle(set),
    clearUtilityLane: createUtilityLaneClearAction(set),
  };
}
