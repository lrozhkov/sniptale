import { applyVideoProjectClipsPatch } from '../../../../features/video/project/mutation';
import type {
  VideoProject,
  VideoProjectClip,
} from '../../../../features/video/project/types/index';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from '../contracts';
import {
  applyProjectUpdate,
  isSourceTimedClip,
  resolveEditableClipOperation,
  updateSourceTimedClipTiming,
} from '../helpers';
import { clampVideoPropertyNumber, VIDEO_CLIP_PROPERTY_LIMITS } from './constraints';
import { getReachableClipTimingBounds } from '../clip-timeline/reachable-placement';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;

function applyEditableClipPatch(
  project: VideoProject,
  clipIdSet: Set<string>,
  updateClip: (clip: VideoProjectClip) => VideoProjectClip
) {
  return applyVideoProjectClipsPatch(
    project,
    project.clips.map((item) => (clipIdSet.has(item.id) ? updateClip(item) : item))
  );
}

function createClipFadeActions(
  set: VideoEditorStoreSet
): Pick<VideoEditorProjectState, 'updateClipFades'> {
  return {
    updateClipFades: (clipId, patch) =>
      set((state) =>
        applyProjectUpdate(state, (project) => {
          const operation = resolveEditableClipOperation(project, clipId);
          if (!operation) {
            return project;
          }

          return applyEditableClipPatch(project, operation.clipIdSet, (item) => {
            const maxFadeMs = Math.min(
              VIDEO_CLIP_PROPERTY_LIMITS.fadeMs.max,
              Math.max(VIDEO_CLIP_PROPERTY_LIMITS.fadeMs.min, item.duration * 1000)
            );
            const fadeLimit = { max: maxFadeMs, min: VIDEO_CLIP_PROPERTY_LIMITS.fadeMs.min };

            return {
              ...item,
              fadeInMs:
                patch.fadeInMs === undefined
                  ? item.fadeInMs
                  : clampVideoPropertyNumber(patch.fadeInMs, fadeLimit),
              fadeOutMs:
                patch.fadeOutMs === undefined
                  ? item.fadeOutMs
                  : clampVideoPropertyNumber(patch.fadeOutMs, fadeLimit),
            };
          });
        })
      ),
  };
}

function createClipTransitionActions(
  set: VideoEditorStoreSet
): Pick<VideoEditorProjectState, 'updateClipTransitions' | 'updateClipPlaybackRate'> {
  return {
    updateClipTransitions: (clipId, patch) =>
      set((state) =>
        applyProjectUpdate(state, (project) => {
          const operation = resolveEditableClipOperation(project, clipId);
          if (!operation) {
            return project;
          }

          return applyEditableClipPatch(project, operation.clipIdSet, (item) => ({
            ...item,
            transitionIn: patch.transitionIn ?? item.transitionIn,
            transitionOut: patch.transitionOut ?? item.transitionOut,
          }));
        })
      ),
    updateClipPlaybackRate: (clipId, playbackRate) =>
      set((state) =>
        applyProjectUpdate(state, (project) => {
          const operation = resolveEditableClipOperation(project, clipId);
          if (!operation || operation.affectedClips.some((clip) => !isSourceTimedClip(clip))) {
            return project;
          }

          let minimumRate: number = VIDEO_CLIP_PROPERTY_LIMITS.playbackRate.min;
          let maximumRate: number = VIDEO_CLIP_PROPERTY_LIMITS.playbackRate.max;
          for (const clip of operation.affectedClips) {
            if (!isSourceTimedClip(clip)) continue;
            const bounds = getReachableClipTimingBounds(project, clip);
            const maximumDuration = bounds.maximumEnd - clip.startTime;
            const minimumDuration = Math.max(1 / project.fps, bounds.minimumEnd - clip.startTime);
            minimumRate = Math.max(minimumRate, clip.sourceDuration / maximumDuration);
            maximumRate = Math.min(maximumRate, clip.sourceDuration / minimumDuration);
          }
          if (minimumRate > maximumRate) return project;
          const nextPlaybackRate = clampVideoPropertyNumber(playbackRate, {
            min: minimumRate,
            max: maximumRate,
          });
          if (
            operation.affectedClips.every(
              (clip) => isSourceTimedClip(clip) && (clip.playbackRate ?? 1) === nextPlaybackRate
            )
          )
            return project;
          return applyEditableClipPatch(project, operation.clipIdSet, (item) =>
            isSourceTimedClip(item)
              ? updateSourceTimedClipTiming(item, { playbackRate: nextPlaybackRate })
              : item
          );
        })
      ),
  };
}

export function createClipPropertyTimingActions(
  set: VideoEditorStoreSet
): Pick<
  VideoEditorProjectState,
  'updateClipFades' | 'updateClipTransitions' | 'updateClipPlaybackRate'
> {
  return {
    ...createClipFadeActions(set),
    ...createClipTransitionActions(set),
  };
}
