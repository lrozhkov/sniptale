import { expect, it } from 'vitest';

import { createCiProductControlOccurrences } from '../../../ci/product-control-policy.mjs';
import { AUDIT_STEPS, CI_COMPOSITION_STEPS, HARNESS_STEPS } from './definitions.data.mjs';
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

it('accepts a format-only harness failure without requiring later lanes', () => {
  expect(() =>
    assertQaExecutionContract({
      wrapperId: 'qa:release-harness',
      steps: steps(['Format'], 'failed'),
    })
  ).not.toThrow();
});

it('accepts the separately scheduled focused messaging step in a failed checkpoint', () => {
  expect(() =>
    assertQaExecutionContract({
      wrapperId: 'qa:checkpoint',
      mode: 'product',
      steps: [
        { label: 'Format', status: 'failed' },
        { label: 'Messaging', status: 'ok' },
      ],
    })
  ).not.toThrow();
});

it('rejects an incomplete harness population after the format barrier passed', () => {
  expect(() =>
    assertQaExecutionContract({
      wrapperId: 'qa:release-harness',
      steps: [
        { label: 'Format', status: 'ok' },
        { label: 'Oxlint', status: 'failed' },
      ],
    })
  ).toThrow(/missing=.*Unit tests/u);
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

it('requires fail-late CI evidence after an earlier control failure', () => {
  const proofSteps = createCiProductControlOccurrences('proof').map(({ label }, index) => ({
    label,
    status: index === 0 ? ('failed' as const) : ('ok' as const),
  }));
  const releaseSteps = createCiProductControlOccurrences('release').map(({ label }, index) => ({
    label,
    status: index === 0 ? ('failed' as const) : ('ok' as const),
  }));
  const auditSteps = AUDIT_STEPS.map(([, label]) => ({ label, status: 'ok' as const }));
  const ciGateSteps = CI_COMPOSITION_STEPS.filter(([, label]) => label === 'Production build').map(
    ([, label]) => ({ label, status: 'ok' as const })
  );

  expect(() => assertQaExecutionContract({ wrapperId: 'ci:proof', steps: proofSteps })).toThrow(
    /missing=.*Full product coverage/u
  );
  expect(() =>
    assertQaExecutionContract({
      wrapperId: 'ci:release',
      mode: 'reuse-fast-proof',
      steps: [{ label: 'Fast proof reuse', status: 'ok' }, ...releaseSteps, ...auditSteps],
    })
  ).toThrow(/missing=.*Production build/u);
  expect(() =>
    assertQaExecutionContract({
      wrapperId: 'ci:release',
      mode: 'reuse-fast-proof',
      steps: [
        { label: 'Fast proof reuse', status: 'ok' },
        ...releaseSteps,
        ...auditSteps,
        ...ciGateSteps,
      ],
    })
  ).not.toThrow();
});
