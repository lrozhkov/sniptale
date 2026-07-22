import { expect, it, vi } from 'vitest';

import { collectHarnessFreshnessStep } from './harness-freshness-step.mjs';

it('validates generated inventory without consulting a harness stamp', () => {
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
