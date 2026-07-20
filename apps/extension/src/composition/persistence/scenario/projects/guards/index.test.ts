import { expect, it } from 'vitest';

import { parseScenarioProject } from './index';

it('re-exports the scenario project parser', () => {
  expect(parseScenarioProject).toBeTypeOf('function');
});
