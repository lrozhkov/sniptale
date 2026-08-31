import { afterEach, expect, it, vi } from 'vitest';

import { importFresh } from '../../../test-support/test-helpers';

afterEach(() => {
  vi.doUnmock('./verify-unit-tests.mjs');
  vi.resetModules();
});

it('fails before invoking Vitest when focused coverage owner mappings are stale', async () => {
  const runUnitTests = vi.fn(() => ({ status: 0, stderr: '', stdout: '' }));
  vi.doMock('../../../proof/unit/verify-unit-tests.mjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../../proof/unit/verify-unit-tests.mjs')>()),
    runUnitTests,
  }));

  const module = await importFresh<typeof import('./test-steps.mjs')>(
    '../composition/checkpoint/focused/test-steps.mjs'
  );
  const steps = await module.runFocusedUnitTests(
    {
      codeFiles: ['apps/extension/src/content/selection/callout/view.tsx'],
      targetFiles: ['apps/extension/src/content/selection/callout/view.tsx'],
    },
    {
      focusedScopeOverride: {
        counts: { coverageTargets: 0, ownerTests: 0, tests: 0 },
        coverageTargetFiles: [],
        detail: 'focused-coverage-owner-mapping-missing-test: src/example/missing.test.ts',
        directTestFiles: [],
        ownerTestsByFile: new Map(),
        reasons: ['focused coverage owner map is invalid'],
        testFiles: [],
        verdict: 'block-invalid-owner-map',
      },
    }
  );

  expect(runUnitTests).not.toHaveBeenCalled();
  expect(steps.map((step) => [step.label, step.status])).toEqual([
    ['Unit tests', 'failed'],
    ['Test coverage', 'skipped'],
  ]);
  expect(steps[0].stderr).toContain('Fix focused coverage owner mappings before running Vitest.');
});
