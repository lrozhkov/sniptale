import { expect, it } from 'vitest';

import {
  collectTaskArtifactViolations,
  runTaskArtifactCommitCheck,
} from './verify-task-artifacts.mjs';
import { createTempRoot, initGitRepo, runGit, withCwd, writeFile } from './test-helpers';

it('flags staged task-artifact files in the root tasks directory', () => {
  expect(collectTaskArtifactViolations(['tasks/example/plan.md'])).toEqual([
    expect.objectContaining({
      rule: 'task-artifacts-staged',
      file: 'tasks/example/plan.md',
    }),
  ]);
});

it('ignores ordinary staged project files', () => {
  expect(collectTaskArtifactViolations(['@sniptale/platform/observability/logger'])).toEqual([]);
});

it('supports explicit file input for hook-level checks', () => {
  const result = runTaskArtifactCommitCheck({
    files: ['tasks/example/plan.md', '@sniptale/platform/observability/logger'],
  });

  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: 'task-artifacts-staged',
      file: 'tasks/example/plan.md',
    }),
  ]);
});

it('falls back to the staged index when sandboxed git spawning is blocked', () => {
  const result = runTaskArtifactCommitCheck({
    sandboxFallback: () => ['tasks/plan.md'],
    spawnSyncImpl: () => ({ error: Object.assign(new Error('blocked'), { code: 'EPERM' }) }),
  });

  expect(result.violations).toEqual([
    {
      rule: 'task-artifacts-staged',
      file: 'tasks/plan.md',
      message: 'tasks/** is workspace-only planning input/output and must not be committed.',
    },
  ]);
});

it('flags staged task-artifact deletions', async () => {
  const root = createTempRoot('task-artifact-delete-');
  initGitRepo(root);
  writeFile(root, 'tasks/plan.md', '# local plan\n');
  runGit(root, 'add', 'tasks/plan.md');
  runGit(root, 'commit', '-m', 'init');
  runGit(root, 'rm', 'tasks/plan.md');

  await withCwd(root, () => {
    expect(runTaskArtifactCommitCheck().violations).toEqual([
      expect.objectContaining({
        rule: 'task-artifacts-staged',
        file: 'tasks/plan.md',
      }),
    ]);
  });
});
