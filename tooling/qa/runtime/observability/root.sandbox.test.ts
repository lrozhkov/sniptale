import { expect, it } from 'vitest';

import { createTempRoot, initGitRepo } from '../../core/test-helpers';
import { resolveObservabilityRoot } from './root.mjs';

it('uses an integer-status git result when a sandbox also reports EPERM', () => {
  const root = createTempRoot('qa-observability-root-eperm-');
  initGitRepo(root);
  const error = Object.assign(new Error('spawnSync git EPERM'), { code: 'EPERM' });

  expect(
    resolveObservabilityRoot({
      cwd: root,
      environment: {},
      spawnSyncImpl: () => ({
        error,
        status: 0,
        stdout: `${root}\n`,
        stderr: '',
      }),
    })
  ).toBe(root);
});

it('does not accept an empty git top-level even with status zero', () => {
  const root = createTempRoot('qa-observability-root-empty-');
  initGitRepo(root);

  expect(() =>
    resolveObservabilityRoot({
      cwd: root,
      environment: {},
      spawnSyncImpl: () => ({ status: 0, stdout: '', stderr: '' }),
    })
  ).toThrow(/existing Git worktree root/u);
});
