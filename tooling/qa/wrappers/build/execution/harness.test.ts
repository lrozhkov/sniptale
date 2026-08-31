import { expect, it } from 'vitest';

const TEST_BUILD_DEPENDENCIES = {};

function createHarnessOnlyContext() {
  return {
    targetFiles: ['tooling/qa/core/example.test.ts'],
    existingTargetFiles: ['tooling/qa/core/example.test.ts'],
    codeFiles: ['tooling/qa/core/example.test.ts'],
    jsLikeFiles: ['tooling/qa/core/example.test.ts'],
    fingerprint: 'harness-only',
  };
}

function createInventoryOnlyContext() {
  return {
    targetFiles: ['tooling/configs/qa/technical-debt.data.json'],
    existingTargetFiles: ['tooling/configs/qa/technical-debt.data.json'],
    codeFiles: [],
    jsLikeFiles: [],
    fingerprint: 'inventory-only',
  };
}

it('requires fresh harness state for harness-only diffs in non-commit mode', async () => {
  const module = await import('../../build.mjs');
  const result = await module.runBuildCloseout({
    ...TEST_BUILD_DEPENDENCIES,
    argv: [],
    contextCollector: createHarnessOnlyContext,
    harnessStateAsserter: () => undefined,
    checkpointStateAsserter: () => undefined,
    closeoutStepCollector: async () => {
      throw new Error('product build checks should not run');
    },
  });

  expect(result.skipped).toBe(false);
  expect(result.steps[0].detail).toContain('fresh harness stamp');
}, 10_000);

it('blocks harness-only non-commit mode when harness state is stale', async () => {
  const module = await import('../../build.mjs');

  await expect(
    module.runBuildCloseout({
      ...TEST_BUILD_DEPENDENCIES,
      argv: [],
      contextCollector: createHarnessOnlyContext,
      harnessStateAsserter: () => {
        throw new Error('Run npm run qa:release-harness for changed tooling/**');
      },
      closeoutStepCollector: async () => {
        throw new Error('product build checks should not run');
      },
    })
  ).rejects.toThrow(/qa:release-harness/u);
});

it('requires a checkpoint but no harness stamp for a generated inventory-only diff', async () => {
  const module = await import('../../build.mjs');
  let checkpointCalls = 0;
  const result = await module.runBuildCloseout({
    ...TEST_BUILD_DEPENDENCIES,
    argv: [],
    contextCollector: createInventoryOnlyContext,
    harnessStateAsserter: () => {
      throw new Error('inventory-only scope must not consult harness state');
    },
    checkpointStateAsserter: () => {
      checkpointCalls += 1;
    },
    closeoutStepCollector: async () => {
      throw new Error('product build checks should not run');
    },
  });

  expect(checkpointCalls).toBe(1);
  expect(result.steps[0].detail).toContain(
    'fresh checkpoint with data-only inventory owner validation'
  );
});

it('blocks an inventory-only build when checkpoint state is stale', async () => {
  const module = await import('../../build.mjs');

  await expect(
    module.runBuildCloseout({
      ...TEST_BUILD_DEPENDENCIES,
      argv: [],
      contextCollector: createInventoryOnlyContext,
      checkpointStateAsserter: () => {
        throw new Error('Run npm run qa:checkpoint for owner validation');
      },
      closeoutStepCollector: async () => {
        throw new Error('product build checks should not run');
      },
    })
  ).rejects.toThrow(/qa:checkpoint/u);
});

it('allows harness-only commit mode after fresh harness and checkpoint states', async () => {
  const module = await import('../../build.mjs');
  const commandCalls: Array<{ command: string; args: string[] }> = [];

  const result = await module.runBuildCloseout({
    ...TEST_BUILD_DEPENDENCIES,
    argv: ['--commit', '-m', 'Harness commit'],
    contextCollector: createHarnessOnlyContext,
    harnessStateAsserter: () => undefined,
    checkpointStateAsserter: () => undefined,
    closeoutStepCollector: async () => {
      throw new Error('product build checks should not run');
    },
    commandRunner: (command: string, args: string[]) => {
      commandCalls.push({ command, args });
      return {
        status: 0,
        stdout: args[0] === 'diff' ? 'tooling/qa/core/example.test.ts\n' : '',
        stderr: '',
      };
    },
    taskArtifactCheck: () => ({
      files: [],
      violations: [],
    }),
  });

  expect(result.steps.map((step) => step.label)).toEqual([
    'Build',
    'Stage changes',
    'Task artifacts',
    'Pre-commit diff guard',
    'Git commit',
  ]);
  expect(commandCalls.some(({ args }) => args[0] === 'commit')).toBe(true);
});

it('blocks harness-only commit mode when harness state is stale after staging', async () => {
  const module = await import('../../build.mjs');
  const commandCalls: Array<{ args: string[] }> = [];

  const result = await module.runBuildCloseout({
    ...TEST_BUILD_DEPENDENCIES,
    argv: ['--commit', '-m', 'Harness commit'],
    contextCollector: createHarnessOnlyContext,
    harnessStateAsserter: (_context: unknown, label: string) => {
      if (label === 'qa:build commit staging') {
        throw new Error('Run npm run qa:release-harness for changed tooling/**');
      }
    },
    checkpointStateAsserter: () => undefined,
    closeoutStepCollector: async () => {
      throw new Error('product build checks should not run');
    },
    commandRunner: (_command: string, args: string[]) => {
      commandCalls.push({ args });
      return { status: 0, stdout: '', stderr: '' };
    },
    taskArtifactCheck: () => ({
      files: [],
      violations: [],
    }),
  });

  expect(result.steps.map((step) => [step.label, step.status])).toEqual([
    ['Build', 'ok'],
    ['Stage changes', 'ok'],
    ['Task artifacts', 'ok'],
    ['Pre-commit diff guard', 'failed'],
  ]);
  expect(commandCalls.some(({ args }) => args[0] === 'commit')).toBe(false);
});
