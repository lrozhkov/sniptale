import {
  parseVideoProjectBookendPresets,
  hasValidVideoProjectBookendReferences,
} from '../../../features/video/project/scene/bookend-presets';
import { isHydratableVideoProject } from '../../../features/video/project/validation/root';
import type { VideoEditorBookendPresetUpdateResult } from '../../contracts/insertion';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from './contracts';
import { applyProjectUpdate } from './helpers';

/** Recipe authoring uses the existing accepted root and one existing history publication. */
export function createBookendPresetUpdateAction(
  set: VideoEditorProjectSliceSet
): VideoEditorProjectState['updateBookendPresets'] {
  return (value, expectedProject) => {
    let outcome: VideoEditorBookendPresetUpdateResult = {
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
      const parsed = value === undefined ? undefined : parseVideoProjectBookendPresets(value);
      if (parsed === null) return refuse('invalid-project');
      if (JSON.stringify(project.bookendPresets) === JSON.stringify(parsed)) {
        outcome = { status: 'unchanged' };
        return state;
      }
      const proposed = { ...project };
      if (parsed === undefined) delete proposed.bookendPresets;
      else proposed.bookendPresets = parsed;
      if (!hasValidVideoProjectBookendReferences(proposed)) return refuse('invalid-project');
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
