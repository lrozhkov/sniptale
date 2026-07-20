import { expect, it } from 'vitest';

import {
  createBuildContext,
  createGreenBuildCloseoutResult,
  createGreenBuildValidationSteps,
  createTempRoot,
  importFresh,
  initGitRepo,
  readGit,
  runGit,
  seedFreshCheckpointState,
  withCwd,
  writeFile,
} from './build.test-support';

const TEST_BUILD_DEPENDENCIES = { producerRunId: 'build-test-run' };

it('requires -m when qa:build runs in commit mode', async () => {
  const module = await import('./build.mjs');

  expect(() => module.parseBuildOptions(['--commit'])).toThrow(/qa:build --commit requires -m/u);
});

it('keeps artifact proof separate from validation and commit work', async () => {
  const module = await import('./build.mjs');
  const calls: string[] = [];

  const result = await module.runBuildCloseout({
    ...TEST_BUILD_DEPENDENCIES,
    argv: ['--proof'],
    contextCollector: createBuildContext,
    checkpointStateAsserter: () => calls.push('checkpoint'),
    closeoutStepCollector: async () => {
      throw new Error('full validation must not run for proof');
    },
    artifactProofCollector: async () => {
      calls.push('artifact');
      return { label: 'Build', status: 'ok' as const, detail: '', durationMs: 0 };
    },
  });

  expect(result.steps.map((step) => step.label)).toEqual(['Build']);
  expect(calls).toEqual(['checkpoint', 'artifact']);
  expect(() => module.parseBuildOptions(['--proof', '--commit', '-m', 'bad'])).toThrow(
    /cannot create a commit/u
  );
}, 120_000);

it('keeps plain qa:build free of staging and commit calls', async () => {
  const module = await import('./build.mjs');
  const commandCalls: Array<{ command: string; args: string[] }> = [];

  const result = await module.runBuildCloseout({
    ...TEST_BUILD_DEPENDENCIES,
    argv: [],
    contextCollector: createBuildContext,
    checkpointStateAsserter: () => {},
    closeoutStepCollector: async () => createGreenBuildCloseoutResult(),
    commandRunner: (command: string, args: string[]) => {
      commandCalls.push({ command, args });
      return {
        status: 0,
        stdout: '',
        stderr: '',
      };
    },
    taskArtifactCheck: () => ({
      files: [],
      violations: [],
    }),
  });

  expect(result.steps).toEqual(createGreenBuildValidationSteps());
  expect(commandCalls).toEqual([]);
});

it('reuses one fresh artifact build only for commit closeout and still runs commit guards', async () => {
  const module = await import('./build.mjs');
  const calls: string[] = [];
  const result = await module.runBuildCloseout({
    argv: ['--commit', '--reuse-build', '-m', 'Reuse artifact build'],
    contextCollector: createBuildContext,
    checkpointStateAsserter: () => calls.push('checkpoint'),
    buildStateAsserter: () => calls.push('build-state'),
    closeoutStepCollector: async () => {
      throw new Error('a reused artifact build must not rerun full validation or build');
    },
    commandRunner: (_command: string, args: string[]) => ({
      status: 0,
      stderr: '',
      stdout: args[0] === 'diff' ? 'tracked.ts\n' : '',
    }),
    taskArtifactCheck: () => ({ files: [], violations: [] }),
  });

  expect(result.steps.map((step) => [step.label, step.status])).toEqual([
    ['Build', 'skipped'],
    ['Pre-commit diff guard', 'ok'],
    ['Stage changes', 'ok'],
    ['Task artifacts', 'ok'],
    ['Git commit', 'ok'],
  ]);
  expect(calls).toEqual(['checkpoint', 'build-state', 'checkpoint']);
  expect(() => module.parseBuildOptions(['--reuse-build'])).toThrow(/requires --commit/u);
});

it('does not stage or commit when build validation fails in commit mode', async () => {
  const module = await import('./build.mjs');
  const commandCalls: Array<{ command: string; args: string[] }> = [];

  const result = await module.runBuildCloseout({
    ...TEST_BUILD_DEPENDENCIES,
    argv: ['--commit', '-m', 'Should not commit'],
    contextCollector: createBuildContext,
    checkpointStateAsserter: () => {},
    closeoutStepCollector: async () => ({
      scopeDetail: '',
      steps: [
        { label: 'Naming', status: 'ok' as const, detail: '', durationMs: 0 },
        { label: 'Build', status: 'failed' as const, summary: 'failed' as const },
      ],
    }),
    commandRunner: (command: string, args: string[]) => {
      commandCalls.push({ command, args });
      return {
        status: 0,
        stdout: '',
        stderr: '',
      };
    },
    taskArtifactCheck: () => ({
      files: [],
      violations: [],
    }),
  });

  expect(result.steps.map((step) => [step.label, step.status])).toEqual([
    ['Naming', 'ok'],
    ['Build', 'failed'],
  ]);
  expect(commandCalls).toEqual([]);
});

it('fails commit mode when staging leaves no staged changes to commit', async () => {
  const module = await import('./build.mjs');
  const commandCalls: Array<{ command: string; args: string[] }> = [];

  const result = await module.runBuildCloseout({
    ...TEST_BUILD_DEPENDENCIES,
    argv: ['--commit', '-m', 'No staged changes'],
    contextCollector: createBuildContext,
    checkpointStateAsserter: () => {},
    closeoutStepCollector: async () => createGreenBuildCloseoutResult(),
    commandRunner: (command: string, args: string[]) => {
      commandCalls.push({ command, args });
      return {
        status: 0,
        stdout: '',
        stderr: '',
      };
    },
    taskArtifactCheck: () => ({
      files: [],
      violations: [],
    }),
  });

  expect(result.steps.map((step) => [step.label, step.status])).toEqual([
    ['Naming', 'ok'],
    ['Security', 'ok'],
    ['Architecture guardrails', 'ok'],
    ['Dependency boundaries', 'ok'],
    ['Cycles', 'ok'],
    ['Canonical facades', 'ok'],
    ['Root side effects', 'ok'],
    ['Typecheck', 'ok'],
    ['Unit tests', 'ok'],
    ['Test coverage', 'ok'],
    ['Build', 'ok'],
    ['Pre-commit diff guard', 'ok'],
    ['Stage changes', 'ok'],
    ['Task artifacts', 'ok'],
    ['Git commit', 'failed'],
  ]);
  expect(commandCalls.some(({ args }) => args[0] === 'commit')).toBe(false);
});

it('blocks commit staging when the diff changes after the fresh checkpoint state', async () => {
  const root = createTempRoot('qa-build-diff-changed-before-stage-');
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
      argv: ['--commit', '-m', 'Should not commit'],
      closeoutStepCollector: async () => {
        writeFile(root, 'unrelated.ts', 'export const unrelated = true;\n');
        return createGreenBuildCloseoutResult();
      },
    });

    expect(result.steps.map((step) => [step.label, step.status])).toEqual([
      ['Naming', 'ok'],
      ['Security', 'ok'],
      ['Architecture guardrails', 'ok'],
      ['Dependency boundaries', 'ok'],
      ['Cycles', 'ok'],
      ['Canonical facades', 'ok'],
      ['Root side effects', 'ok'],
      ['Typecheck', 'ok'],
      ['Unit tests', 'ok'],
      ['Test coverage', 'ok'],
      ['Build', 'ok'],
      ['Pre-commit diff guard', 'failed'],
    ]);
  });

  expect(readGit(root, 'log', '-1', '--pretty=%s')).toBe('init');
  expect(readGit(root, 'diff', '--cached', '--name-only')).toBe('');
});

it('blocks qa:build before commit mode when checkpoint state is stale for the current diff', async () => {
  const root = createTempRoot('qa-build-stale-checkpoint-');
  initGitRepo(root);
  writeFile(root, '.gitignore', '.tmp/\n');
  writeFile(root, 'package.json', '{"name":"qa-build-commit-temp"}\n');
  writeFile(root, 'tracked.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.gitignore', 'package.json', 'tracked.ts');
  runGit(root, 'commit', '-m', 'init');

  writeFile(root, 'tracked.ts', 'export const value = 2;\n');

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./build.mjs')>('./build.mjs', import.meta.url);

    await expect(
      module.runBuildCloseout({
        ...TEST_BUILD_DEPENDENCIES,
        argv: ['--commit', '-m', 'Should not commit'],
        closeoutStepCollector: async () => createGreenBuildCloseoutResult(),
      })
    ).rejects.toThrow(/Run npm run qa:checkpoint/u);
  });
});

it('blocks the build step when related unit tests fail in qa:build', async () => {
  const module = await import('./build.mjs');

  const result = await module.runBuildCloseout({
    ...TEST_BUILD_DEPENDENCIES,
    argv: [],
    contextCollector: createBuildContext,
    checkpointStateAsserter: () => {},
    closeoutStepCollector: async () => ({
      scopeDetail: 'broader related tests (1 related file)',
      steps: [
        { label: 'Naming', status: 'ok' as const, detail: '', durationMs: 0 },
        { label: 'Security', status: 'ok' as const, detail: '', durationMs: 0 },
        { label: 'Unit tests', status: 'failed' as const, summary: 'failed' as const },
        {
          label: 'Test coverage',
          status: 'skipped' as const,
          detail: 'skipped: unit tests failed' as const,
        },
        { label: 'Build', status: 'blocked' as const, detail: 'earlier hardfail steps failed' },
      ],
    }),
  });

  expect(result.steps.map((step) => [step.label, step.status])).toEqual([
    ['Naming', 'ok'],
    ['Security', 'ok'],
    ['Unit tests', 'failed'],
    ['Test coverage', 'skipped'],
    ['Build', 'blocked'],
  ]);
});
