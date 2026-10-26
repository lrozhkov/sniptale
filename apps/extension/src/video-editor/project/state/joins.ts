import {
  parseVideoProjectCompositionJoins,
  hasValidVideoProjectCompositionJoinReferences,
} from '../../../features/video/project/scene/joins';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from './contracts';
import { applyGuardedProjectRootMutation } from './helpers';

/** Edits explicit whole-frame boundaries through the sole accepted-root and history owners. */
export function createCompositionJoinUpdateAction(
  set: VideoEditorProjectSliceSet
): VideoEditorProjectState['updateCompositionJoins'] {
  return (value, expectedProject) =>
    applyGuardedProjectRootMutation(set, expectedProject, (project) => {
      const parsed = value === undefined ? undefined : parseVideoProjectCompositionJoins(value);
      if (parsed === null) return null;
      if (JSON.stringify(project.compositionJoins) === JSON.stringify(parsed)) return project;
      const proposed = { ...project };
      if (parsed === undefined) delete proposed.compositionJoins;
      else proposed.compositionJoins = parsed;
      return hasValidVideoProjectCompositionJoinReferences(proposed) ? proposed : null;
    });
}
