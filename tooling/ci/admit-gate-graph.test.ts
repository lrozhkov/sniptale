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

const github = {
  ...vm,
  executionPath: 'github',
  provisionResult: 'skipped',
  cleanupResult: 'skipped',
};

const RESULTS = ['success', 'failure', 'cancelled', 'skipped'] as const;
const PATHS = ['derived', 'vm', 'github', 'unknown'] as const;

function valueAt<T>(values: readonly T[], index: number, stride: number): T {
  return values[Math.floor(index / stride) % values.length];
}

function completeGraphMatrix() {
  const resultCombinations = RESULTS.length ** 6;
  return Array.from({ length: resultCombinations * PATHS.length * 2 }, (_, index) => ({
    admissionResult: valueAt(RESULTS, index, 1),
    canonicalResult: valueAt(RESULTS, index, RESULTS.length),
    classifierResult: valueAt(RESULTS, index, RESULTS.length ** 2),
    cleanupResult: valueAt(RESULTS, index, RESULTS.length ** 3),
    imageResult: valueAt(RESULTS, index, RESULTS.length ** 4),
    provisionResult: valueAt(RESULTS, index, RESULTS.length ** 5),
    executionPath: valueAt(PATHS, index, resultCombinations),
    reuse: valueAt([false, true], index, resultCombinations * PATHS.length),
  }));
}

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

it('admits only the declared derived and VM graphs across the complete GitHub result matrix', () => {
  const admitted = completeGraphMatrix().filter((graph) => {
    try {
      admitGateGraph(graph);
      return true;
    } catch {
      return false;
    }
  });
  const expected = [
    derived,
    vm,
    { ...vm, classifierResult: 'skipped' },
    github,
    { ...github, classifierResult: 'skipped' },
  ];
  expect(admitted).toHaveLength(expected.length);
  expect(admitted).toEqual(expect.arrayContaining(expected));
});

it('admits GitHub-hosted execution only after canonical and trusted proof succeed', () => {
  expect(admitGateGraph(github)).toMatchObject({ outcome: 'passed', executionPath: 'github' });
});

it.each([
  { ...github, admissionResult: 'skipped' },
  { ...github, canonicalResult: 'failure' },
  { ...github, canonicalResult: 'cancelled' },
  { ...github, provisionResult: 'success' },
  { ...github, cleanupResult: 'failure' },
  { ...github, reuse: true },
])('rejects an incomplete or mixed GitHub execution graph %#', (graph) => {
  expect(() => admitGateGraph(graph)).toThrow(/explicitly admitted/u);
});
