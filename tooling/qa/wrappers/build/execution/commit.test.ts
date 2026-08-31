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
} from './test-support';

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
    const module = await importFresh<typeof import('../../build.mjs')>(
      '../../build.mjs',
      import.meta.url
    );

    const result = await module.runBuildCloseout({
      ...TEST_BUILD_DEPENDENCIES,
      argv: ['--commit', '-m', 'Commit from qa build'],
      closeoutStepCollector: async () => createGreenBuildCloseoutResult(),
    });

    expect(result.steps.map((step) => step.label)).toEqual([
      'Build',
      'Stage changes',
      'Task artifacts',
      'Pre-commit diff guard',
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
    const module = await importFresh<typeof import('../../build.mjs')>(
      '../../build.mjs',
      import.meta.url
    );
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
    const module = await importFresh<typeof import('../../build.mjs')>(
      '../../build.mjs',
      import.meta.url
    );

    const result = await module.runBuildCloseout({
      ...TEST_BUILD_DEPENDENCIES,
      argv: ['--commit', '-m', 'Should fail'],
      closeoutStepCollector: async () => createGreenBuildCloseoutResult(),
    });

    expect(result.steps.map((step) => step.label)).toEqual([
      'Build',
      'Stage changes',
      'Task artifacts',
    ]);
    expect(result.steps.at(-1)?.status).toBe('failed');
  });

  expect(readGit(root, 'log', '-1', '--pretty=%s')).toBe('init');
});

it('blocks a candidate mutation between staging and the final diff guard', async () => {
  const root = createTempRoot('qa-build-staged-candidate-mutation-');
  initGitRepo(root);
  writeFile(root, '.gitignore', '.tmp/\n');
  writeFile(root, 'package.json', '{"name":"qa-build-staged-candidate-mutation"}\n');
  writeFile(root, 'tracked.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.gitignore', 'package.json', 'tracked.ts');
  runGit(root, 'commit', '-m', 'init');
  writeFile(root, 'tracked.ts', 'export const value = 2;\n');

  await withCwd(root, async () => {
    await seedFreshCheckpointState();
    const module = await importFresh<typeof import('../../build.mjs')>(
      '../../build.mjs',
      import.meta.url
    );

    const result = await module.runBuildCloseout({
      ...TEST_BUILD_DEPENDENCIES,
      argv: ['--commit', '-m', 'Must detect mutation'],
      closeoutStepCollector: async () => createGreenBuildCloseoutResult(),
      taskArtifactCheck: () => {
        writeFile(root, 'tracked.ts', 'export const value = 3;\n');
        return { files: [], violations: [] };
      },
    });

    expect(result.steps.slice(-3).map((step) => [step.label, step.status])).toEqual([
      ['Stage changes', 'ok'],
      ['Task artifacts', 'ok'],
      ['Pre-commit diff guard', 'failed'],
    ]);
  });

  expect(readGit(root, 'log', '-1', '--pretty=%s')).toBe('init');
  expect(readGit(root, 'diff', '--cached', '--name-only')).toBe('tracked.ts');
  expect(readGit(root, 'diff', '--name-only')).toBe('tracked.ts');
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
    const module = await importFresh<typeof import('../../build.mjs')>(
      '../../build.mjs',
      import.meta.url
    );

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
