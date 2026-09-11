import { expect, it } from 'vitest';
import { getEffectInsertionError } from './placement';
import { createEmptyVideoProject } from '../factories/creation';
import { createVideoClip } from '../timeline/project-meta.test.helpers';
it('shares collision admission across UI and commands, including logical lanes', () => {
  const project = createEmptyVideoProject('placement');
  const track = project.tracks[0]!;
  track.logicalLanes = [{ id: 'line-2' }];
  project.clips = [createVideoClip({ trackId: track.id, startTime: 0, duration: 5 })];
  expect(getEffectInsertionError(project, track.id, 1, 2)).toBe('effectTargetOccupied');
  expect(getEffectInsertionError(project, track.id, 1, 2, 'line-2')).toBeNull();
  expect(getEffectInsertionError(project, track.id, 1, 2, 'unknown')).toBe('effectTargetMissing');
  expect(getEffectInsertionError(project, 'missing', 1, 2)).toBe('effectTargetMissing');
  expect(getEffectInsertionError(project, track.id, -1, 2)).toBe('effectTargetMissing');
  expect(getEffectInsertionError(project, track.id, 8, 0)).toBe('effectTargetMissing');
  expect(getEffectInsertionError(project, track.id, 5, 2)).toBeNull();
});
