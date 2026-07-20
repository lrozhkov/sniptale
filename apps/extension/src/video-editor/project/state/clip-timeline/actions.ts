import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from '../contracts';
import {
  applyProjectUpdate,
  detachLinkedClips,
  pruneUnusedProjectAssets,
  resolveEditableClipOperation,
} from '../helpers';
import {
  closeProjectTrackGap,
  duplicateProjectClips,
  moveProjectClip,
  splitProjectClipsAtTime,
  trimProjectClipEnd,
  trimProjectClipStart,
} from './mutations';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;

type VideoEditorProjectClipTimelineActionKeys =
  | 'moveClip'
  | 'trimClipStart'
  | 'trimClipEnd'
  | 'splitClipAt'
  | 'deleteClip'
  | 'duplicateClip'
  | 'detachClipGroup'
  | 'closeTrackGap';

export function createVideoEditorProjectClipTimelineActions(
  set: VideoEditorStoreSet
): Pick<VideoEditorProjectState, VideoEditorProjectClipTimelineActionKeys> {
  return {
    moveClip: (clipId, startTime, trackId, timelineLaneId) =>
      set((state) =>
        applyProjectUpdate(state, (project) =>
          moveProjectClip(project, clipId, startTime, trackId, timelineLaneId)
        )
      ),
    closeTrackGap: createCloseTrackGapAction(set),
    trimClipStart: (clipId, nextStartTime) =>
      set((state) =>
        applyProjectUpdate(state, (project) => trimProjectClipStart(project, clipId, nextStartTime))
      ),
    trimClipEnd: (clipId, nextEndTime) =>
      set((state) =>
        applyProjectUpdate(state, (project) => trimProjectClipEnd(project, clipId, nextEndTime))
      ),
    splitClipAt: (clipId, splitTime) =>
      set((state) =>
        applyProjectUpdate(state, (project) => splitProjectClipsAtTime(project, clipId, splitTime))
      ),
    deleteClip: createDeleteClipAction(set),
    duplicateClip: (clipId) =>
      set((state) =>
        applyProjectUpdate(state, (project) => duplicateProjectClips(project, clipId))
      ),
    detachClipGroup: (clipId) =>
      set((state) => applyProjectUpdate(state, (project) => detachLinkedClips(project, clipId))),
  };
}

function createDeleteClipAction(set: VideoEditorStoreSet): VideoEditorProjectState['deleteClip'] {
  return (clipId) =>
    set((state) => {
      const project = state.project;
      if (!project) {
        return {};
      }

      const operation = resolveEditableClipOperation(project, clipId);
      if (!operation) {
        return {};
      }

      return applyProjectUpdate(state, () =>
        pruneUnusedProjectAssets(
          applyVideoProjectMutationPatch(project, {
            clips: project.clips.filter((item) => !operation.clipIdSet.has(item.id)),
          })
        )
      );
    });
}

function createCloseTrackGapAction(
  set: VideoEditorStoreSet
): VideoEditorProjectState['closeTrackGap'] {
  return (trackId, gapStart, gapEnd) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        closeProjectTrackGap(project, trackId, gapStart, gapEnd)
      )
    );
}
