import { expect, it } from 'vitest';
import { createScenarioProject } from '../../../features/scenario/project/factories/project';
import { areScenarioProjectsEqual } from './aggregate-comparison';

it('compares canonical scenario graphs structurally', () => {
  const left = createScenarioProject('Scenario');
  const equal = structuredClone(left);
  const renamed = { ...structuredClone(left), name: 'Different' };

  expect(areScenarioProjectsEqual(left, equal)).toBe(true);
  expect(areScenarioProjectsEqual(left, renamed)).toBe(false);
});
