import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import { getClipEndTime } from '../../../features/video/project/timeline';
import { normalizeVideoProjectTransition } from '../../../features/video/project/transition/template';
import type { VideoEditorTransitionTemplatePatch } from '../../contracts/commands/patches';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from './contracts';
import { applyProjectUpdate } from './helpers';
import { moveProjectClip } from './clip-timeline/mutations';

type VideoEditorStoreSet = VideoEditorProjectSliceSet;

export function createTransitionDurationUpdater(set: VideoEditorStoreSet) {
  return (transitionId: string, duration: number) =>
    set((state) =>
      applyProjectUpdate(state, (project) => {
        const transition = (project.transitions ?? []).find((item) => item.id === transitionId);
        const leadingClip = project.clips.find((clip) => clip.id === transition?.leadingClipId);
        if (!transition || !leadingClip) {
          return project;
        }

        return moveProjectClip(
          project,
          transition.trailingClipId,
          Math.max(0, getClipEndTime(leadingClip) - duration)
        );
      })
    );
}

export function createTransitionEasingUpdater(set: VideoEditorStoreSet) {
  return (
    transitionId: string,
    easing: Parameters<VideoEditorProjectState['updateTransitionEasing']>[1]
  ) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        applyVideoProjectMutationPatch(project, {
          transitions: (project.transitions ?? []).map((transition) =>
            transition.id === transitionId
              ? normalizeVideoProjectTransition({ ...transition, easing })
              : transition
          ),
        })
      )
    );
}

export function createTransitionTemplateUpdater(set: VideoEditorStoreSet) {
  return (transitionId: string, patch: VideoEditorTransitionTemplatePatch) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        applyVideoProjectMutationPatch(project, {
          transitions: (project.transitions ?? []).map((transition) =>
            transition.id === transitionId
              ? normalizeVideoProjectTransition({ ...transition, ...patch })
              : transition
          ),
        })
      )
    );
}
