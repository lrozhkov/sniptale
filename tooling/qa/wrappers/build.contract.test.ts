import { expect, it } from 'vitest';

import { createBuildContext } from './build.test-support';

it('does not publish artifact state when the canonical population rejects proof', async () => {
  const module = await import('./build.mjs');
  const writtenStates: unknown[] = [];
  await expect(
    module.runBuildCloseout({
      producerRunId: 'build-contract-test-run',
      argv: ['--proof'],
      contextCollector: createBuildContext,
      checkpointStateAsserter: () => {},
      artifactProofCollector: async () => ({
        label: 'Build',
        status: 'ok' as const,
        detail: '',
        durationMs: 0,
      }),
      executionContractAsserter: () => {
        throw new Error('injected contract rejection');
      },
      buildStateWriter: (state) => writtenStates.push(state),
    })
  ).rejects.toThrow(/injected contract rejection/u);
  expect(writtenStates).toEqual([]);
});
