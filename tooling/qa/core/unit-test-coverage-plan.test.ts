import { expect, it } from 'vitest';

import { resolveCoveragePlan } from './unit-test-coverage-plan.mjs';

it('does not discover coverage targets for a fully specified no-coverage plan', () => {
  const plan = resolveCoveragePlan({
    codeFiles: [],
    coverageEnabled: false,
    coverageTargetResolver: () => {
      throw new Error('explicit no-coverage plan must not scan coverage targets');
    },
    relatedFilesOverride: [],
    releaseMode: false,
  });

  expect(plan).toEqual({
    mode: 'skip',
    coverageTargetFiles: [],
    coverageCheckFiles: [],
    detail: 'coverage handled by qa:audit',
    relatedFiles: [],
  });
});
