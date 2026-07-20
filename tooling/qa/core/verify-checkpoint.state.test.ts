import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from './test-helpers';

function createCheckpointStateRoot() {
  const root = createTempRoot('verify-checkpoint-state-');
  initGitRepo(root);
  writeFile(root, '.gitignore', '.tmp/\n');
  writeFile(root, 'package.json', '{"name":"verify-checkpoint-temp"}\n');
  writeFile(root, 'tracked.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.gitignore', 'package.json', 'tracked.ts');
  runGit(root, 'commit', '-m', 'init');
  return root;
}

function expectHarnessChangeInvalidatesFullDiff(args: {
  checkpointHelpers: typeof import('./verify-checkpoint.state.helpers.mjs');
  context: ReturnType<typeof import('./qa-scope.mjs').createScopedQaContext>;
  harnessChangedContext: ReturnType<typeof import('./qa-scope.mjs').createScopedQaContext>;
}) {
  const checkpointState = args.checkpointHelpers.readCheckpointState();
  expect(args.harnessChangedContext.fingerprint).toBe(args.context.fingerprint);
  expect(checkpointState?.diffFingerprint).toBe(args.context.fingerprint);
  expect(args.harnessChangedContext.allFingerprint).not.toBe(args.context.allFingerprint);
  expect(() =>
    args.checkpointHelpers.assertFreshCheckpointState(args.harnessChangedContext, 'qa:build')
  ).toThrow(/full-diff .*current repo diff/u);
}

it('validates checkpoint state freshness against the current diff fingerprint', async () => {
  const root = createCheckpointStateRoot();
  writeFile(root, 'tracked.ts', 'export const value = 2;\n');

  await withCwd(root, async () => {
    const advisoryHelpers = await importFresh<typeof import('../runtime/current-diff.helpers.mjs')>(
      '../runtime/current-diff.helpers.mjs'
    );
    const qaScope = await importFresh<typeof import('./qa-scope.mjs')>('./qa-scope.mjs');
    const checkpointHelpers = await importFresh<
      typeof import('./verify-checkpoint.state.helpers.mjs')
    >('./verify-checkpoint.state.helpers.mjs');
    const context = qaScope.createScopedQaContext(advisoryHelpers.collectCurrentDiffContext());

    expect(() => checkpointHelpers.assertFreshCheckpointState(context, 'qa:build')).toThrow(
      /Run npm run qa:checkpoint/u
    );
    expect(() => checkpointHelpers.createCheckpointState({ context, success: true })).toThrow(
      /producer run ID/u
    );

    checkpointHelpers.writeCheckpointState(
      checkpointHelpers.createCheckpointState({
        context,
        success: true,
        producerRunId: 'checkpoint-run-1',
      })
    );

    expect(() => checkpointHelpers.assertFreshCheckpointState(context, 'qa:build')).not.toThrow();

    writeFile(root, 'tooling/qa/example.mjs', 'export const harness = true;\n');
    const harnessChangedContext = qaScope.createScopedQaContext(
      advisoryHelpers.collectCurrentDiffContext()
    );
    expectHarnessChangeInvalidatesFullDiff({
      checkpointHelpers,
      context,
      harnessChangedContext,
    });

    writeFile(root, 'tracked.ts', 'export const value = 3;\n');
    const staleContext = qaScope.createScopedQaContext(advisoryHelpers.collectCurrentDiffContext());
    expect(() => checkpointHelpers.assertFreshCheckpointState(staleContext, 'qa:build')).toThrow(
      /fingerprint does not match/u
    );
  });
});
