import {
  parseVideoProjectBookendPresets,
  hasValidVideoProjectBookendReferences,
} from '../../../features/video/project/scene/bookend-presets';
import type { VideoEditorProjectState, VideoEditorProjectSliceSet } from './contracts';
import { applyGuardedProjectRootMutation } from './helpers';

/** Recipe authoring uses the existing accepted root and one existing history publication. */
export function createBookendPresetUpdateAction(
  set: VideoEditorProjectSliceSet
): VideoEditorProjectState['updateBookendPresets'] {
  return (value, expectedProject) =>
    applyGuardedProjectRootMutation(set, expectedProject, (project) => {
      const parsed = value === undefined ? undefined : parseVideoProjectBookendPresets(value);
      if (parsed === null) return null;
      if (JSON.stringify(project.bookendPresets) === JSON.stringify(parsed)) return project;
      const proposed = { ...project };
      if (parsed === undefined) delete proposed.bookendPresets;
      else proposed.bookendPresets = parsed;
      return hasValidVideoProjectBookendReferences(proposed) ? proposed : null;
    });
}
