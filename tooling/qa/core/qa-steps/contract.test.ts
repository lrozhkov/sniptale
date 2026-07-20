import { expect, it } from 'vitest';

import { HARNESS_STEPS } from './definitions.data.mjs';
import { assertQaExecutionContract, assertQaResultContract } from './contract.mjs';

function steps(labels: string[], status: 'failed' | 'ok' = 'ok') {
  return labels.map((label) => ({ label, status }));
}

it('accepts the complete harness population and rejects stale or unknown entries', () => {
  const harnessLabels = HARNESS_STEPS.map(([, label]) => label);
  expect(() =>
    assertQaExecutionContract({
      wrapperId: 'qa:release-harness',
      steps: steps(harnessLabels),
    })
  ).not.toThrow();
  expect(() =>
    assertQaExecutionContract({
      wrapperId: 'qa:release-harness',
      steps: steps(harnessLabels.slice(0, -1)),
    })
  ).toThrow(/missing=.*Unit tests/u);
  expect(() =>
    assertQaExecutionContract({
      wrapperId: 'qa:release-harness',
      steps: steps([...harnessLabels, 'Unregistered execution']),
    })
  ).toThrow(/unexpected=.*Unregistered execution/u);
});

it('models help and no-target outcomes as explicit wrapper modes', () => {
  expect(() =>
    assertQaExecutionContract({
      wrapperId: 'qa:build',
      mode: 'help',
      steps: steps(['Wrapper help']),
    })
  ).not.toThrow();
  expect(() =>
    assertQaExecutionContract({
      wrapperId: 'qa:release-harness',
      mode: 'no-targets',
      skipped: true,
      steps: steps(['QA release harness', 'No applicable targets']),
    })
  ).not.toThrow();
});

it('models clean, harness-only, and reused closeout populations explicitly', () => {
  expect(() =>
    assertQaResultContract({
      wrapperId: 'qa:checkpoint',
      result: {
        executionMode: 'no-targets',
        skipped: true,
        steps: steps(['Format'], 'ok').map((step) => ({ ...step, status: 'skipped' })),
      },
    })
  ).not.toThrow();
  expect(() =>
    assertQaResultContract({
      wrapperId: 'qa:checkpoint',
      result: {
        executionMode: 'harness-only',
        skipped: false,
        steps: steps(['Format', 'Harness QA']),
      },
    })
  ).not.toThrow();
  expect(() =>
    assertQaResultContract({
      wrapperId: 'qa:closeout',
      result: {
        executionMode: 'executed-harness-only-with-build',
        skipped: false,
        steps: steps(['Format', 'Harness QA', 'Full build']),
      },
    })
  ).not.toThrow();
  expect(() =>
    assertQaResultContract({
      wrapperId: 'qa:closeout',
      result: {
        executionMode: 'reused-product-with-build',
        skipped: false,
        steps: steps(['QA checkpoint', 'Full build']),
      },
    })
  ).not.toThrow();
});
