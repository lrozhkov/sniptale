import { expect, it } from 'vitest';
import { createGuideProject } from '../../../features/scenario/project/factories';
import { areScenarioProjectsEqual } from './aggregate-comparison';

it('compares canonical scenario graphs structurally', () => {
  const left = createGuideProject('Scenario');
  const equal = structuredClone(left);
  const renamed = { ...structuredClone(left), name: 'Different' };

  expect(areScenarioProjectsEqual(left, equal)).toBe(true);
  expect(areScenarioProjectsEqual(left, renamed)).toBe(false);
});
