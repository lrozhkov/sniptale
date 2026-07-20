import { expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd } from '../core/test-helpers';

const ignoreExecutionContract = () => {};

function okStep(label: string) {
  return {
    label,
    status: 'ok' as const,
    detail: '',
    durationMs: 0,
  };
}

it('skips release harness when there are no changed harness files', async () => {
  const root = createTempRoot('qa-release-harness-skip-');
  const writtenStates: unknown[] = [];

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./release-harness.mjs')>(
      './release-harness.mjs',
      import.meta.url
    );
    const result = await module.runReleaseHarness({
      producerRunId: 'harness-test-run-1',
      executionContractAsserter: ignoreExecutionContract,
      contextCollector: () => ({
        targetFiles: ['src/example.ts'],
        existingTargetFiles: ['src/example.ts'],
        codeFiles: ['src/example.ts'],
        jsLikeFiles: ['src/example.ts'],
        fingerprint: 'product',
      }),
      harnessStepCollector: async ({ context }) => ({
        skipped: context.harnessTargetFiles.length === 0,
        steps: [okStep('QA release harness')],
      }),
      stateWriter: (state) => writtenStates.push(state),
    });

    expect(result.skipped).toBe(true);
    expect(result.context.targetFiles).toEqual([]);
    expect(writtenStates).toHaveLength(1);
  });
});

it('records a fresh green release-harness state for changed harness files', async () => {
  const root = createTempRoot('qa-release-harness-green-');
  const writtenStates: Array<{ success: boolean; targetFiles: string[] }> = [];

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./release-harness.mjs')>(
      './release-harness.mjs',
      import.meta.url
    );
    const result = await module.runReleaseHarness({
      producerRunId: 'harness-test-run-2',
      executionContractAsserter: ignoreExecutionContract,
      contextCollector: () => ({
        targetFiles: ['tooling/qa/core/example.test.ts'],
        existingTargetFiles: ['tooling/qa/core/example.test.ts'],
        codeFiles: ['tooling/qa/core/example.test.ts'],
        jsLikeFiles: ['tooling/qa/core/example.test.ts'],
        fingerprint: 'harness',
      }),
      harnessStepCollector: async () => ({
        skipped: false,
        steps: [okStep('Format'), okStep('Unit tests')],
      }),
      stateWriter: (state) => writtenStates.push(state),
    });

    expect(result.skipped).toBe(false);
    expect(result.context.targetFiles).toEqual(['tooling/qa/core/example.test.ts']);
  });

  expect(writtenStates[0]).toMatchObject({
    success: true,
    targetFiles: ['tooling/qa/core/example.test.ts'],
  });
});

it('records a failed release-harness state when a harness step fails', async () => {
  const root = createTempRoot('qa-release-harness-fail-');
  const writtenStates: Array<{ success: boolean; errorMessage: string }> = [];

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./release-harness.mjs')>(
      './release-harness.mjs',
      import.meta.url
    );
    await module.runReleaseHarness({
      producerRunId: 'harness-test-run-3',
      executionContractAsserter: ignoreExecutionContract,
      contextCollector: () => ({
        targetFiles: ['tooling/release/package-dist.test.ts'],
        existingTargetFiles: ['tooling/release/package-dist.test.ts'],
        codeFiles: ['tooling/release/package-dist.test.ts'],
        jsLikeFiles: ['tooling/release/package-dist.test.ts'],
        fingerprint: 'harness',
      }),
      harnessStepCollector: async () => ({
        skipped: false,
        steps: [{ label: 'Unit tests', status: 'failed' as const, summary: 'failed' }],
      }),
      stateWriter: (state) => writtenStates.push(state),
    });
  });

  expect(writtenStates[0]).toMatchObject({
    success: false,
    errorMessage: 'Unit tests failed',
  });
});

it('does not publish harness state when the canonical population rejects the result', async () => {
  const module = await import('./release-harness.mjs');
  const writtenStates: unknown[] = [];

  await expect(
    module.runReleaseHarness({
      producerRunId: 'harness-rejected-run',
      contextCollector: () => ({
        targetFiles: ['tooling/qa/core/example.test.ts'],
        existingTargetFiles: ['tooling/qa/core/example.test.ts'],
      }),
      harnessStepCollector: async () => ({ skipped: false, steps: [okStep('Format')] }),
      executionContractAsserter: () => {
        throw new Error('injected contract rejection');
      },
      stateWriter: (state) => writtenStates.push(state),
    })
  ).rejects.toThrow(/injected contract rejection/u);
  expect(writtenStates).toEqual([]);
});
