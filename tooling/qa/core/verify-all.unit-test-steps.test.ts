import { expect, it, vi } from 'vitest';

import {
  createDirectUnitTestStep,
  createReusableUnitTestStep,
} from './verify-all.unit-test-results.mjs';

vi.mock('./verify-unit-tests.mjs', () => ({
  runUnitTests: vi.fn(() => ({ status: 0, stderr: '', stdout: '' })),
}));

it('preserves the selected build profile in a successful direct unit-test step', () => {
  expect(
    createDirectUnitTestStep({
      directFiles: ['apps/extension/src/popup/shell/app/view.test.tsx'],
      durationMs: 12,
      unitTestDetailOverride: 'profile=owner-direct; direct tests (1)',
      unitTestResult: { status: 0, stderr: '', stdout: '' },
    })
  ).toEqual({
    label: 'Unit tests',
    status: 'ok',
    detail: 'profile=owner-direct; direct tests (1)',
    durationMs: 12,
  });
});

it('keeps the default direct-test detail when no profile override is supplied', () => {
  expect(
    createDirectUnitTestStep({
      directFiles: ['apps/extension/src/popup/shell/app/view.test.tsx'],
      durationMs: 8,
      unitTestResult: { status: 0, stderr: '', stdout: '' },
    })
  ).toMatchObject({
    detail: 'direct changed tests (1)',
    status: 'ok',
  });
});

it('preserves the selected profile when a related unit-test plan is reused', () => {
  expect(
    createReusableUnitTestStep(
      { plan: { mode: 'related' }, source: 'checkpoint' },
      0,
      'profile=related-transitive; broader related tests (2 related files)'
    )
  ).toMatchObject({
    detail:
      'profile=related-transitive; broader related tests (2 related files); reused checkpoint related test plan',
    status: 'ok',
  });
});

it('executes the full product suite when a deleted target has no affected-test scope', async () => {
  const unitTestModule = await import('./verify-unit-tests.mjs');
  const runUnitTests = vi.mocked(unitTestModule.runUnitTests);
  runUnitTests.mockClear();

  const module = await import('./verify-all.unit-test-steps.mjs');
  const steps = await module.collectUnitTestAndCoverageStepResults({
    codeFiles: [],
    coverageEnabled: false,
    directFilesOverride: [],
    fullSuiteOverride: true,
    relatedFilesOverride: [],
    releaseMode: false,
    targetFiles: ['apps/extension/src/gallery/unmapped-deleted-leaf.tsx'],
    unitTestDetailOverride:
      'profile=related-transitive; full product test suite; reason=deleted target',
  });

  expect(steps[0]).toMatchObject({
    detail: 'profile=related-transitive; full product test suite; reason=deleted target',
    label: 'Unit tests',
    status: 'ok',
  });
  expect(runUnitTests).toHaveBeenCalledWith(
    expect.objectContaining({
      relatedFiles: [],
      suite: 'product',
    })
  );
});
