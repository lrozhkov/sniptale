import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import { getVideoProjectActionPresentation } from '../action-presentation';
import { isHydratableVideoProject } from './root';

it('validates presentation defaults at the project boundary', () => {
  const project = createEmptyVideoProject('History');
  const defaults = getVideoProjectActionPresentation(project);
  expect(isHydratableVideoProject({ ...project, actionPresentation: defaults })).toBe(true);
  for (const patch of [
    { enabled: 'yes' },
    { duration: 0 },
    { duration: Infinity },
    { offset: NaN },
    { clickSuppressionInterval: -1 },
    { clickPreset: 'unknown' },
    { showKeystrokes: 1 },
  ]) {
    expect(
      isHydratableVideoProject({ ...project, actionPresentation: { ...defaults, ...patch } })
    ).toBe(false);
  }
  expect(isHydratableVideoProject({ ...project, actionPresentation: null })).toBe(false);
});
