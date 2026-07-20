import { afterEach, expect, it, vi } from 'vitest';

import { importFresh } from './test-helpers';

const ownerTests = [
  'cleanup.boundaries.test.ts',
  'guards.boundaries.test.ts',
  'guards.test.ts',
  'index.boundaries.test.ts',
  'index.test.ts',
  'mutations.test.ts',
].map((file) => `apps/extension/src/composition/persistence/page-style/storage/${file}`);

afterEach(() => {
  vi.doUnmock('./verify-test-coverage.mjs');
  vi.resetModules();
});

it('runs explicit local owner tests with coverage for rollout-controlled files', async () => {
  const runUnitTests = vi.fn(() => ({ status: 0, stderr: '', stdout: '' }));
  vi.doMock('./verify-test-coverage.mjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./verify-test-coverage.mjs')>()),
    resolveCoverageTargetFiles: (files: { files?: string[] } = {}) => files.files ?? [],
    runTestCoverageCheck: () => ({ error: null, skipped: false, violations: [] }),
  }));
  const module = await importFresh<typeof import('./verify-focused.test-steps.mjs')>(
    './verify-focused.test-steps.mjs',
    import.meta.url
  );
  const ownerFile = 'apps/extension/src/composition/persistence/page-style/storage/local-owner.ts';
  const steps = await module.runFocusedUnitTests(
    { codeFiles: [ownerFile], targetFiles: [ownerFile] },
    {
      focusedScopeOverride: {
        counts: { coverageTargets: 1, ownerTests: ownerTests.length, tests: ownerTests.length },
        coverageTargetFiles: [ownerFile],
        detail: 'local owner tests=6; coverageTargets=1',
        directTestFiles: [],
        ownerTestsByFile: new Map([[ownerFile, ownerTests]]),
        reasons: [],
        testFiles: ownerTests,
        verdict: 'run-local-coverage',
      },
      runUnitTestsImpl: runUnitTests,
    }
  );

  expect(runUnitTests).toHaveBeenCalledWith(
    expect.objectContaining({
      coverage: true,
      coverageMode: 'diff',
      coverageTargets: [ownerFile],
      directFiles: ownerTests,
    })
  );
  expect(steps.map((step) => step.label)).toEqual(['Unit tests', 'Test coverage']);
});
