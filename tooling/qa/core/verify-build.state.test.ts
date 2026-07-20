import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from './test-helpers';

it('binds a reusable artifact build to the current HEAD and full worktree diff', async () => {
  const root = createTempRoot('verify-build-state-');
  initGitRepo(root);
  writeFile(root, '.gitignore', '.tmp/\n');
  writeFile(root, 'tracked.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'init');
  writeFile(root, 'tracked.ts', 'export const value = 2;\n');

  await withCwd(root, async () => {
    const diff = await importFresh<typeof import('../runtime/current-diff.helpers.mjs')>(
      '../runtime/current-diff.helpers.mjs'
    );
    const scope = await importFresh<typeof import('./qa-scope.mjs')>('./qa-scope.mjs');
    const state = await importFresh<typeof import('./verify-build.state.helpers.mjs')>(
      './verify-build.state.helpers.mjs'
    );
    const context = scope.createScopedQaContext(diff.collectCurrentDiffContext());
    expect(() => state.createBuildState({ context, success: true })).toThrow(/producer run ID/u);
    state.writeBuildState(
      state.createBuildState({ context, success: true, producerRunId: 'build-run-1' })
    );

    expect(() => state.assertFreshBuildState(context, 'qa:closeout')).not.toThrow();
    writeFile(root, 'tracked.ts', 'export const value = 3;\n');
    const changedContext = scope.createScopedQaContext(diff.collectCurrentDiffContext());
    expect(() => state.assertFreshBuildState(changedContext, 'qa:closeout')).toThrow(
      /full-diff fingerprint/u
    );
  });
});
