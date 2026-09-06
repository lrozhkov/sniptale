import { beforeEach, expect, it, vi } from 'vitest';

import { createDirectUnitTestStep, createReusableUnitTestStep } from './unit-test-results.mjs';
import { collectUnitTestAndCoverageStepResults } from './unit-test-steps.mjs';
import { resolveReusableUnitTestPlan } from '../../../proof/unit/unit-test-cache.mjs';
import {
  recordSuccessfulFullUnitProof,
  resolveReusableFullUnitProof,
} from '../../../proof/unit/unit-test-proof.mjs';
import { runUnitTests } from '../../../proof/unit/verify-unit-tests.mjs';

vi.mock('../../../proof/unit/unit-test-cache.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../proof/unit/unit-test-cache.mjs')>();
  return {
    ...actual,
    resolveReusableUnitTestPlan: vi.fn(actual.resolveReusableUnitTestPlan),
  };
});

vi.mock('../../../proof/unit/verify-unit-tests.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../proof/unit/verify-unit-tests.mjs')>();
  return {
    ...actual,
    runUnitTests: vi.fn(() => ({ status: 0, stderr: '', stdout: '' })),
  };
});

vi.mock('../../../proof/unit/unit-test-proof.mjs', () => ({
  recordSuccessfulFullUnitProof: vi.fn(),
  resolveReusableFullUnitProof: vi.fn(() => ({
    matched: false,
    reason: 'no admissible full unit proof',
  })),
}));

const mockedResolveReusableUnitTestPlan = vi.mocked(resolveReusableUnitTestPlan);
const mockedRecordSuccessfulFullUnitProof = vi.mocked(recordSuccessfulFullUnitProof);
const mockedResolveReusableFullUnitProof = vi.mocked(resolveReusableFullUnitProof);
const mockedRunUnitTests = vi.mocked(runUnitTests);

beforeEach(() => {
  mockedResolveReusableUnitTestPlan.mockReset();
  mockedResolveReusableUnitTestPlan.mockReturnValue({
    matched: false,
    reason: 'no cached execution state',
  });
  mockedResolveReusableFullUnitProof.mockReset();
  mockedResolveReusableFullUnitProof.mockReturnValue({
    matched: false,
    reason: 'no admissible full unit proof',
  });
  mockedRecordSuccessfulFullUnitProof.mockClear();
  mockedRunUnitTests.mockClear();
  mockedRunUnitTests.mockReturnValue({ status: 0, stderr: '', stdout: '' });
});

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
  mockedRunUnitTests.mockClear();

  const steps = await collectUnitTestAndCoverageStepResults({
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
  expect(mockedRunUnitTests).toHaveBeenCalledWith(
    expect.objectContaining({
      relatedFiles: [],
      suite: 'product',
    })
  );
});

it('executes graph-closed deletion proof as direct tests without related discovery', async () => {
  mockedRunUnitTests.mockClear();
  const ownerTest = 'apps/extension/src/content/selection/example/runtime.test.ts';

  const steps = await collectUnitTestAndCoverageStepResults({
    codeFiles: [],
    coverageEnabled: false,
    directFilesOverride: [ownerTest],
    relatedFilesOverride: [],
    releaseMode: false,
    targetFiles: ['apps/extension/src/content/selection/example/facade.ts'],
    unitTestDetailOverride:
      'profile=owner-direct; direct tests (1); reason=graph-closed changed-owner proof',
  });

  expect(steps[0]).toMatchObject({
    detail: 'profile=owner-direct; direct tests (1); reason=graph-closed changed-owner proof',
    status: 'ok',
  });
  expect(mockedRunUnitTests).toHaveBeenCalledWith(
    expect.objectContaining({
      directFiles: [ownerTest],
      suite: 'product',
    })
  );
  expect(mockedRunUnitTests.mock.calls[0]?.[0]).not.toHaveProperty('relatedFiles');
});

it('requires at least one related test for graph-closed deletion successor proof', async () => {
  mockedRunUnitTests.mockClear();
  const successor = 'apps/extension/src/background/example/non-rollout-owner.ts';

  await collectUnitTestAndCoverageStepResults({
    codeFiles: [],
    coverageEnabled: false,
    directFilesOverride: [],
    relatedFilesOverride: [successor],
    requireRelatedTestsOverride: true,
    releaseMode: false,
    targetFiles: ['apps/extension/src/background/example/deleted-facade.ts'],
  });

  expect(mockedRunUnitTests).toHaveBeenCalledWith(
    expect.objectContaining({
      relatedFiles: [successor],
      requireTests: true,
      suite: 'product',
    })
  );
});

it('reuses an exact sealed release full-suite proof and records the current proof chain', async () => {
  mockedResolveReusableUnitTestPlan.mockClear();
  mockedResolveReusableFullUnitProof.mockReturnValueOnce({
    matched: true,
    plan: { mode: 'full' },
    proof: { proofDigest: 'a'.repeat(64) },
    source: 'external proof',
  });
  mockedRecordSuccessfulFullUnitProof.mockClear();
  mockedRunUnitTests.mockClear();

  const steps = await collectUnitTestAndCoverageStepResults({
    codeFiles: [],
    coverageEnabled: false,
    releaseMode: true,
    targetFiles: [],
  });

  expect(mockedResolveReusableUnitTestPlan).not.toHaveBeenCalled();
  expect(mockedRunUnitTests).not.toHaveBeenCalled();
  expect(mockedRecordSuccessfulFullUnitProof).toHaveBeenCalledWith(
    expect.objectContaining({ reusedFrom: 'a'.repeat(64), suite: 'product' })
  );
  expect(steps[0]).toMatchObject({
    detail: expect.stringContaining('reused external proof full test plan'),
    label: 'Unit tests',
    status: 'ok',
  });
});

it('runs and seals the complete release suite when no proof is admissible', async () => {
  mockedResolveReusableFullUnitProof.mockReturnValueOnce({
    matched: false,
    reason: 'full unit proof inputs changed',
  });
  mockedRecordSuccessfulFullUnitProof.mockClear();
  mockedRunUnitTests.mockClear();

  await collectUnitTestAndCoverageStepResults({
    codeFiles: [],
    coverageEnabled: false,
    maxWorkers: 2,
    releaseMode: true,
    targetFiles: [],
  });

  expect(mockedRunUnitTests).toHaveBeenCalledWith(
    expect.objectContaining({ maxWorkers: 2, relatedFiles: [], suite: 'product' })
  );
  expect(mockedRecordSuccessfulFullUnitProof).toHaveBeenCalledWith(
    expect.objectContaining({ maxWorkers: 2, source: 'full-verify', suite: 'product' })
  );
});
