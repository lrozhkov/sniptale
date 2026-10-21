import {
  parseVideoProjectCompositionJoins,
  hasValidVideoProjectCompositionJoinReferences,
} from '../../../features/video/project/scene/joins';
import { isHydratableVideoProject } from '../../../features/video/project/validation/root';
import type { VideoEditorCompositionJoinUpdateResult } from '../../contracts/insertion';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from './contracts';
import { applyProjectUpdate } from './helpers';

/** Edits explicit whole-frame boundaries through the sole accepted-root and history owners. */
export function createCompositionJoinUpdateAction(
  set: VideoEditorProjectSliceSet
): VideoEditorProjectState['updateCompositionJoins'] {
  return (value, expectedProject) => {
    let outcome: VideoEditorCompositionJoinUpdateResult = {
      status: 'rejected',
      reason: 'no-project',
    };
    set((state) => {
      const refuse = (reason: Extract<typeof outcome, { status: 'rejected' }>['reason']) => {
        outcome = { status: 'rejected', reason };
        return state;
      };
      const project = state.project;
      if (!project) return state;
      if (project !== expectedProject) return refuse('stale-project');
      if (state.projectHistory.transaction) return refuse('history-busy');
      const parsed = value === undefined ? undefined : parseVideoProjectCompositionJoins(value);
      if (parsed === null) return refuse('invalid-project');
      if (JSON.stringify(project.compositionJoins) === JSON.stringify(parsed)) {
        outcome = { status: 'unchanged' };
        return state;
      }
      const proposed = { ...project };
      if (parsed === undefined) delete proposed.compositionJoins;
      else proposed.compositionJoins = parsed;
      if (!hasValidVideoProjectCompositionJoinReferences(proposed))
        return refuse('invalid-project');
      const update = applyProjectUpdate(state, () => proposed);
      if (!update.project || !isHydratableVideoProject(update.project))
        return refuse('invalid-project');
      if (update.projectHistory?.error) return refuse('history-unavailable');
      outcome = { status: 'updated' };
      return update;
    });
    return outcome;
  };
}
