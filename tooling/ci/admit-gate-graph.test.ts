import { expect, it } from 'vitest';

import { admitGateGraph } from './admit-gate-graph.mjs';

const derived = {
  admissionResult: 'success',
  canonicalResult: 'skipped',
  classifierResult: 'success',
  cleanupResult: 'skipped',
  executionPath: 'derived',
  imageResult: 'skipped',
  provisionResult: 'skipped',
  reuse: true,
};

const vm = {
  admissionResult: 'success',
  canonicalResult: 'success',
  classifierResult: 'success',
  cleanupResult: 'success',
  executionPath: 'vm',
  imageResult: 'success',
  provisionResult: 'success',
  reuse: false,
};

it('admits only the exact derived or VM graphs', () => {
  expect(admitGateGraph(derived)).toMatchObject({ outcome: 'passed', executionPath: 'derived' });
  expect(admitGateGraph(vm)).toMatchObject({ outcome: 'passed', executionPath: 'vm' });
});

it.each([
  { ...derived, canonicalResult: 'success' },
  { ...derived, cleanupResult: 'success' },
  { ...vm, cleanupResult: 'skipped' },
  { ...vm, admissionResult: 'skipped' },
  { ...vm, canonicalResult: 'skipped' },
])('rejects ambiguous skipped-job state %#', (graph) => {
  expect(() => admitGateGraph(graph)).toThrow(/explicitly admitted/u);
});
