import { expect, it } from 'vitest';

import {
  createGreenBuildCloseoutResult,
  createTempRoot,
  importFresh,
  initGitRepo,
  readGit,
  runGit,
  seedFreshCheckpointState,
  withCwd,
  writeFile,
} from './build.test-support';

const TEST_BUILD_DEPENDENCIES = {};

it('commits staged changes only after a successful build in commit mode', async () => {
  const root = createTempRoot('qa-build-commit-');
  initGitRepo(root);
  writeFile(root, '.gitignore', '.tmp/\n');
  writeFile(root, 'package.json', '{"name":"qa-build-commit-temp"}\n');
  writeFile(root, 'tracked.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.gitignore', 'package.json', 'tracked.ts');
  runGit(root, 'commit', '-m', 'init');

  writeFile(root, 'tracked.ts', 'export const value = 2;\n');

  await withCwd(root, async () => {
    await seedFreshCheckpointState();
    const module = await importFresh<typeof import('./build.mjs')>('./build.mjs', import.meta.url);

    const result = await module.runBuildCloseout({
      ...TEST_BUILD_DEPENDENCIES,
      argv: ['--commit', '-m', 'Commit from qa build'],
      closeoutStepCollector: async () => createGreenBuildCloseoutResult(),
    });

    expect(result.steps.map((step) => step.label)).toEqual([
      'Naming',
      'Security',
      'Architecture guardrails',
      'Dependency boundaries',
      'Cycles',
      'Canonical facades',
      'Root side effects',
      'Typecheck',
      'Unit tests',
      'Test coverage',
      'Build',
      'Pre-commit diff guard',
      'Stage changes',
      'Task artifacts',
      'Git commit',
    ]);
    expect(result.steps.every((step) => step.status === 'ok')).toBe(true);
    expect(JSON.stringify(result.steps.at(-1))).not.toContain('Commit from qa build');
  });

  expect(readGit(root, 'log', '-1', '--pretty=%s')).toBe('Commit from qa build');
  expect(readGit(root, 'status', '--short')).toBe('');
});

it('does not stage or commit when the canonical planned population is rejected', async () => {
  const root = createTempRoot('qa-build-contract-rejected-');
  initGitRepo(root);
  writeFile(root, '.gitignore', '.tmp/\n');
  writeFile(root, 'package.json', '{"name":"qa-build-contract-rejected"}\n');
  writeFile(root, 'tracked.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.gitignore', 'package.json', 'tracked.ts');
  runGit(root, 'commit', '-m', 'init');
  writeFile(root, 'tracked.ts', 'export const value = 2;\n');

  await withCwd(root, async () => {
    await seedFreshCheckpointState();
    const module = await importFresh<typeof import('./build.mjs')>('./build.mjs', import.meta.url);
    await expect(
      module.runBuildCloseout({
        argv: ['--commit', '-m', 'Must not commit'],
        closeoutStepCollector: async () => createGreenBuildCloseoutResult(),
        executionContractAsserter: () => {
          throw new Error('injected contract rejection');
        },
      })
    ).rejects.toThrow(/injected contract rejection/u);
  });

  expect(readGit(root, 'log', '-1', '--pretty=%s')).toBe('init');
  expect(readGit(root, 'diff', '--cached', '--name-only')).toBe('');
});

it('blocks commit mode when task artifacts were auto-staged', async () => {
  const root = createTempRoot('qa-build-task-artifacts-');
  initGitRepo(root);
  writeFile(root, '.gitignore', '.tmp/\n');
  writeFile(root, 'package.json', '{"name":"qa-build-commit-temp"}\n');
  writeFile(root, 'tracked.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.gitignore', 'package.json', 'tracked.ts');
  runGit(root, 'commit', '-m', 'init');

  writeFile(root, 'tracked.ts', 'export const value = 2;\n');
  writeFile(root, 'tasks/plan.md', '# local task artifact\n');

  await withCwd(root, async () => {
    await seedFreshCheckpointState();
    const module = await importFresh<typeof import('./build.mjs')>('./build.mjs', import.meta.url);

    const result = await module.runBuildCloseout({
      ...TEST_BUILD_DEPENDENCIES,
      argv: ['--commit', '-m', 'Should fail'],
      closeoutStepCollector: async () => createGreenBuildCloseoutResult(),
    });

    expect(result.steps.map((step) => step.label)).toEqual([
      'Naming',
      'Security',
      'Architecture guardrails',
      'Dependency boundaries',
      'Cycles',
      'Canonical facades',
      'Root side effects',
      'Typecheck',
      'Unit tests',
      'Test coverage',
      'Build',
      'Pre-commit diff guard',
      'Stage changes',
      'Task artifacts',
    ]);
    expect(result.steps.at(-1)?.status).toBe('failed');
  });

  expect(readGit(root, 'log', '-1', '--pretty=%s')).toBe('init');
});

it('commits deletion-only changes in commit mode', async () => {
  const root = createTempRoot('qa-build-delete-only-');
  initGitRepo(root);
  writeFile(root, '.gitignore', '.tmp/\n');
  writeFile(root, 'package.json', '{"name":"qa-build-commit-temp"}\n');
  writeFile(root, 'tracked.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.gitignore', 'package.json', 'tracked.ts');
  runGit(root, 'commit', '-m', 'init');
  runGit(root, 'rm', 'tracked.ts');

  await withCwd(root, async () => {
    await seedFreshCheckpointState();
    const module = await importFresh<typeof import('./build.mjs')>('./build.mjs', import.meta.url);

    const result = await module.runBuildCloseout({
      ...TEST_BUILD_DEPENDENCIES,
      argv: ['--commit', '-m', 'Delete tracked file'],
      closeoutStepCollector: async () => createGreenBuildCloseoutResult(),
    });

    expect(result.steps.map((step) => [step.label, step.status])).toContainEqual([
      'Git commit',
      'ok',
    ]);
  });

  expect(readGit(root, 'log', '-1', '--pretty=%s')).toBe('Delete tracked file');
  expect(readGit(root, 'status', '--short')).toBe('');
});
