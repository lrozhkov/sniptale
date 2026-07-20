import { expect, it } from 'vitest';

import { runCloseout } from './closeout.mjs';

function okStep(label: string) {
  return { label, status: 'ok' as const, detail: '', durationMs: 0 };
}

function collectEmptyContext() {
  return { targetFiles: [], existingTargetFiles: [], addedFiles: [], untrackedFiles: [] };
}

it('validates explicit clean-tree and harness-only closeout populations before build', async () => {
  const forceExecutedCheckpoint = () => {
    throw new Error('force executed checkpoint');
  };
  const noTargets = await runCloseout({
    argv: ['-m', 'No targets'],
    checkpointStateAsserter: forceExecutedCheckpoint,
    contextCollector: collectEmptyContext,
    checkpointRunner: async () => ({
      context: { targetFiles: [], harnessTargetFiles: [] },
      executionMode: 'no-targets',
      readyForBuild: false,
      skipped: true,
      steps: [{ ...okStep('Format'), status: 'skipped' as const }],
    }),
  });
  expect(noTargets).toMatchObject({
    executionMode: 'executed-no-targets-checkpoint-only',
    skipped: true,
  });

  const harnessOnly = await runCloseout({
    argv: ['-m', 'Harness only'],
    checkpointStateAsserter: forceExecutedCheckpoint,
    contextCollector: collectEmptyContext,
    buildStepCollector: () => okStep('Full build'),
    checkpointRunner: async () => ({
      context: { targetFiles: [], harnessTargetFiles: ['tooling/qa/example.mjs'] },
      executionMode: 'harness-only',
      readyForBuild: true,
      skipped: false,
      steps: [okStep('Format'), okStep('Harness QA')],
    }),
  });
  expect(harnessOnly.executionMode).toBe('executed-harness-only-with-build');
  expect(harnessOnly.steps.map(({ label }) => label)).toEqual([
    'Format',
    'Harness QA',
    'Full build',
  ]);
}, 10_000);
