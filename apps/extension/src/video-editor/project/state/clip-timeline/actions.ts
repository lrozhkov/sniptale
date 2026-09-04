import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from '../contracts';
import type { VideoEditorClipTimingResult } from '../../../contracts/commands/timeline';
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
    moveClip: createMoveClipAction(set),
    closeTrackGap: createCloseTrackGapAction(set),
    trimClipStart: createClipTimingAction(set, trimProjectClipStart),
    trimClipEnd: createClipTimingAction(set, trimProjectClipEnd),
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

function createMoveClipAction(set: VideoEditorStoreSet): VideoEditorProjectState['moveClip'] {
  return (clipId, startTime, trackId, timelineLaneId) => {
    let result: VideoEditorClipTimingResult | null = null;
    set((state) => {
      const patch = applyProjectUpdate(state, (project) =>
        moveProjectClip(project, clipId, startTime, trackId, timelineLaneId)
      );
      result = resolveAppliedClipTiming(patch.project ?? state.project, clipId);
      return patch;
    });
    return result;
  };
}

function createClipTimingAction(
  set: VideoEditorStoreSet,
  mutate: (
    project: NonNullable<VideoEditorProjectState['project']>,
    clipId: string,
    time: number
  ) => NonNullable<VideoEditorProjectState['project']>
): VideoEditorProjectState['trimClipStart'] {
  return (clipId, time) => {
    let result: VideoEditorClipTimingResult | null = null;
    set((state) => {
      const patch = applyProjectUpdate(state, (project) => mutate(project, clipId, time));
      result = resolveAppliedClipTiming(patch.project ?? state.project, clipId);
      return patch;
    });
    return result;
  };
}

function resolveAppliedClipTiming(
  project: VideoEditorProjectState['project'] | undefined,
  clipId: string
): VideoEditorClipTimingResult | null {
  const clip = project?.clips.find((item) => item.id === clipId);
  return clip
    ? {
        clipId,
        duration: clip.duration,
        endTime: clip.startTime + clip.duration,
        startTime: clip.startTime,
        timelineLaneId: clip.timelineLaneId ?? null,
        trackId: clip.trackId,
      }
    : null;
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
