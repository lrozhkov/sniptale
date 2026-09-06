import { expect, it } from 'vitest';

import { resolveFinalStatus, summarizeSteps } from './run-record.mjs';

it('counts inherited success and blocked failure without collapsing their outcomes', () => {
  const steps = [
    { outcome: 'inherited', problemIds: [] },
    { outcome: 'blocked', problemIds: ['qa.rule.build.blocked'] },
  ];

  expect(summarizeSteps(steps)).toMatchObject({
    passed: 1,
    problemsFound: 1,
    problemIds: ['qa.rule.build.blocked'],
  });
  expect(resolveFinalStatus(steps)).toBe('problems-found');
});
