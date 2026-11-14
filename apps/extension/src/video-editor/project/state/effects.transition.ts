import type { VideoProject, VideoProjectTransition } from '../../../features/video/project/types';
import { applyVideoProjectMutationPatch } from '../../../features/video/project/mutation';
import { getClipEndTime } from '../../../features/video/project/timeline';
import { parseVideoProjectTransition } from '../../../features/video/project/transition/contract';
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
        updateExplicitTransition(project, transitionId, (transition) =>
          transition.easing === easing
            ? transition
            : (parseVideoProjectTransition({ ...transition, easing }) ?? transition)
        )
      )
    );
}

export function createTransitionTemplateUpdater(set: VideoEditorStoreSet) {
  return (transitionId: string, patch: VideoEditorTransitionTemplatePatch) =>
    set((state) =>
      applyProjectUpdate(state, (project) =>
        updateExplicitTransition(project, transitionId, (transition) =>
          transition.kind === 'gl' ? updateTransitionSelection(transition, patch) : transition
        )
      )
    );
}

function updateExplicitTransition(
  project: VideoProject,
  id: string,
  update: (transition: VideoProjectTransition) => VideoProjectTransition
): VideoProject {
  let changed = false;
  const transitions = project.transitions?.map((transition) => {
    const next = transition.id === id ? update(transition) : transition;
    if (next !== transition) changed = true;
    return next;
  });
  return changed && transitions
    ? applyVideoProjectMutationPatch(project, { transitions })
    : project;
}

function updateTransitionSelection(
  transition: Extract<VideoProjectTransition, { kind: 'gl' }>,
  patch: VideoEditorTransitionTemplatePatch
) {
  const next = { ...transition, selection: patch.selection };
  if (patch.presetId === null) delete next.presetId;
  else if (patch.presetId !== undefined) next.presetId = patch.presetId;
  return parseVideoProjectTransition(next) ?? transition;
}
