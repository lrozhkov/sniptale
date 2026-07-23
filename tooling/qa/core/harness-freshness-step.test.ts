import { expect, it, vi } from 'vitest';

import {
  collectHarnessFreshnessStep,
  collectHarnessInventoryViolations,
} from './harness-freshness-step.mjs';

const COVERAGE_ROLLOUT_INVENTORY = 'tooling/qa/core/verify-test-coverage.rollout-files.data.mjs';

it('validates machine-owned inventory without consulting a harness stamp', () => {
  const harnessStateAsserter = vi.fn();
  const step = collectHarnessFreshnessStep(
    {
      harnessTargetFiles: ['tooling/configs/qa/technical-debt.data.json'],
      harnessInventoryTargetFiles: ['tooling/configs/qa/technical-debt.data.json'],
      harnessVerificationTargetFiles: [],
    },
    harnessStateAsserter,
    'qa:checkpoint',
    () => []
  );

  expect(step).toMatchObject({
    status: 'ok',
    detail: 'data-only inventory owner validators passed',
  });
  expect(harnessStateAsserter).not.toHaveBeenCalled();
});

it('keeps executable policy changes behind a fresh harness stamp', () => {
  const harnessStateAsserter = vi.fn();
  const context = {
    harnessTargetFiles: ['tooling/configs/qa/quality-baseline.json'],
    harnessInventoryTargetFiles: [],
    harnessVerificationTargetFiles: ['tooling/configs/qa/quality-baseline.json'],
  };

  const step = collectHarnessFreshnessStep(
    context,
    harnessStateAsserter,
    'qa:checkpoint',
    () => []
  );

  expect(step).toMatchObject({ status: 'ok', detail: 'fresh qa:release-harness stamp' });
  expect(harnessStateAsserter).toHaveBeenCalledWith(context, 'qa:checkpoint');
});

it('owner-validates the exact coverage rollout inventory without consulting a harness stamp', () => {
  const harnessStateAsserter = vi.fn();
  const step = collectHarnessFreshnessStep(
    {
      harnessTargetFiles: [COVERAGE_ROLLOUT_INVENTORY],
      harnessInventoryTargetFiles: [COVERAGE_ROLLOUT_INVENTORY],
      harnessVerificationTargetFiles: [],
    },
    harnessStateAsserter
  );

  expect(step).toMatchObject({
    status: 'ok',
    detail: 'data-only inventory owner validators passed',
  });
  expect(harnessStateAsserter).not.toHaveBeenCalled();
});

it('fails the harness step when the exact coverage rollout owner validator rejects data', () => {
  const context = {
    harnessTargetFiles: [COVERAGE_ROLLOUT_INVENTORY],
    harnessInventoryTargetFiles: [COVERAGE_ROLLOUT_INVENTORY],
    harnessVerificationTargetFiles: [],
  };
  const coverageInventoryValidator = vi.fn(() => ['invalid exact rollout path']);

  const step = collectHarnessFreshnessStep(context, vi.fn(), 'qa:checkpoint', (currentContext) =>
    collectHarnessInventoryViolations(currentContext, { coverageInventoryValidator })
  );

  expect(step).toMatchObject({
    status: 'failed',
    violations: [
      {
        file: COVERAGE_ROLLOUT_INVENTORY,
        message: 'invalid exact rollout path',
        rule: 'coverage-rollout-inventory',
      },
    ],
  });
  expect(coverageInventoryValidator).toHaveBeenCalledOnce();
});
