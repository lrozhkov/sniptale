import fs from 'node:fs';

import { expect, it } from 'vitest';

import { createTempRoot, importFresh, initGitRepo, withCwd } from '../core/test-helpers';
import { createObservabilityRun } from '../runtime/observability/run.mjs';

const ignoreExecutionContract = () => {};

function okStep(label: string) {
  return {
    label,
    status: 'ok' as const,
    detail: '',
    durationMs: 0,
  };
}

function checkpointResult(readyForBuild = true) {
  return {
    context: {
      targetFiles: ['src/example.ts'],
    },
    readyForBuild,
    skipped: false,
    steps: [okStep('Format'), okStep('Advisory report'), okStep('Oxlint')],
  };
}

function closeoutContext() {
  return {
    targetFiles: ['src/example.ts'],
    existingTargetFiles: ['src/example.ts'],
    fingerprint: 'current-diff',
  };
}

it('maps qa:closeout -m to qa:build commit mode', async () => {
  const module = await import('./closeout.mjs');

  expect(() => module.parseCloseoutOptions([])).toThrow(/requires -m/u);
  expect(() => module.parseCloseoutOptions(['--commit'])).toThrow(/owns commit mode/u);
  expect(module.parseCloseoutOptions(['-m', 'Verified wrapper flow'])).toEqual({
    files: [],
    buildArgs: ['--commit', '-m', 'Verified wrapper flow'],
  });
}, 10_000);

it('rejects the retired contract-governance profile', async () => {
  const module = await import('./closeout.mjs');

  expect(() =>
    module.parseCloseoutOptions(['--governance', '-m', 'Governance transition'])
  ).toThrow(/retired governance profile/u);
});

it('passes both the closeout token and owner pid through the build handoff env', async () => {
  const module = await import('./closeout.mjs');

  expect(module.createCloseoutBuildHandoffEnv('token-value', 12345)).toEqual({
    SNIPTALE_QA_CLOSEOUT_BUILD_LOCK: 'token-value',
    SNIPTALE_QA_CLOSEOUT_BUILD_OWNER_PID: '12345',
  });
  expect(
    module.createCloseoutBuildHandoffEnv('token-value', 12345, {
      parentRunId: 'parent-run',
      rootRunId: 'root-run',
      runId: 'child-run',
    })
  ).toEqual({
    SNIPTALE_QA_CLOSEOUT_BUILD_LOCK: 'token-value',
    SNIPTALE_QA_CLOSEOUT_BUILD_OWNER_PID: '12345',
    SNIPTALE_QA_PARENT_RUN_ID: 'parent-run',
    SNIPTALE_QA_ROOT_RUN_ID: 'root-run',
    SNIPTALE_QA_RUN_ID: 'child-run',
    SNIPTALE_QA_SUPPRESS_SUMMARY: '1',
  });
});

it('registers the generated handoff token before any child output is captured', async () => {
  const module = await import('./closeout.mjs');
  const calls: string[] = [];
  const token = 'dynamic-closeout-token';
  const step = module.collectBuildStep(
    [],
    {
      parentRunId: 'parent-run',
      rootRunId: 'parent-run',
      registerSensitiveValues: (values: string[]) => calls.push(`register:${values.join(',')}`),
    },
    {
      tokenFactory: () => token,
      handoffAuthorizer: () => calls.push('authorize'),
      npmRunner: () => {
        calls.push('spawn');
        return { status: 1, stdout: token, stderr: '' };
      },
    }
  );

  expect(calls).toEqual([`register:${token}`, 'authorize', 'spawn']);
  expect(step.status).toBe('failed');
});

it('resolves a preassigned closeout child to its structured run and log evidence', async () => {
  const root = createTempRoot('qa-closeout-evidence-');
  initGitRepo(root);
  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./closeout.mjs')>(
      './closeout.mjs',
      import.meta.url
    );
    const child = createObservabilityRun({
      wrapperId: 'qa:build',
      rootDir: root,
      runId: 'child-build-run',
      parentRunId: 'parent-closeout-run',
      rootRunId: 'root-closeout-run',
    });
    const childRecord = child.finalize();

    const expectation = {
      parentRunId: 'parent-closeout-run',
      rootRunId: 'root-closeout-run',
      processExitCode: 0,
    };
    expect(module.collectChildRunEvidence(child.runId, expectation)).toEqual([
      {
        kind: 'child-run',
        runId: child.runId,
        recordPath: expect.stringMatching(/\.tmp\/qa-observability\/runs\/.+\.json$/u),
        logPath: expect.stringMatching(/\.tmp\/qa-logs\/.+\.log$/u),
      },
    ]);
    expect(() => module.collectChildRunEvidence('missing-child-run', expectation)).toThrow(
      /evidence is unavailable/u
    );
    expect(() =>
      module.collectChildRunEvidence(child.runId, { ...expectation, rootRunId: 'forged-root' })
    ).toThrow(/lineage or result does not match/u);
    fs.appendFileSync(`${root}/${childRecord.log.path}`, 'tampered');
    expect(() => module.collectChildRunEvidence(child.runId, expectation)).toThrow(
      /log integrity does not match/u
    );
  });
});

it('runs checkpoint before build while the closeout lock stays held for build handoff', async () => {
  const root = createTempRoot('qa-closeout-flow-');
  const calls: string[] = [];

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./closeout.mjs')>(
      './closeout.mjs',
      import.meta.url
    );
    const result = await module.runCloseout({
      argv: ['-m', 'Closeout commit'],
      executionContractAsserter: ignoreExecutionContract,
      checkpointStateAsserter: () => {
        throw new Error('stale checkpoint state');
      },
      contextCollector: closeoutContext,
      checkpointRunner: async () => {
        calls.push('checkpoint');
        return checkpointResult();
      },
      onBeforeBuild: () => calls.push('handoff'),
      buildStepCollector: (buildArgs: string[]) => {
        calls.push(`build:${buildArgs.join(' ')}`);
        return okStep('Full build');
      },
    });

    expect(result.steps.map((step) => step.label)).toEqual([
      'Format',
      'Advisory report',
      'Oxlint',
      'Full build',
    ]);
  });

  expect(calls).toEqual(['checkpoint', 'handoff', 'build:--commit -m Closeout commit']);
});

it('skips checkpoint before build when the current diff has fresh green checkpoint state', async () => {
  const module = await import('./closeout.mjs');
  const calls: string[] = [];

  const result = await module.runCloseout({
    argv: ['-m', 'Closeout commit'],
    executionContractAsserter: ignoreExecutionContract,
    checkpointStateAsserter: () => calls.push('checkpoint-state'),
    contextCollector: () => ({
      targetFiles: ['src/example.ts'],
      existingTargetFiles: ['src/example.ts'],
      fingerprint: 'current-diff',
    }),
    checkpointRunner: async () => {
      calls.push('checkpoint');
      return checkpointResult();
    },
    onBeforeBuild: () => calls.push('handoff'),
    buildStepCollector: (buildArgs: string[]) => {
      calls.push(`build:${buildArgs.join(' ')}`);
      return okStep('Full build');
    },
  });

  expect(result.steps.map((step) => [step.label, step.status])).toEqual([
    ['QA checkpoint', 'skipped'],
    ['Full build', 'ok'],
  ]);
  expect(calls).toEqual(['checkpoint-state', 'handoff', 'build:--commit -m Closeout commit']);
});

it('reuses a fresh artifact build instead of invoking a second build during closeout', async () => {
  const module = await import('./closeout.mjs');
  const calls: string[] = [];

  const result = await module.runCloseout({
    argv: ['-m', 'Closeout commit'],
    executionContractAsserter: ignoreExecutionContract,
    checkpointStateAsserter: () => calls.push('checkpoint-state'),
    buildStateAsserter: () => calls.push('build-state'),
    contextCollector: closeoutContext,
    checkpointRunner: async () => {
      throw new Error('fresh checkpoint state must be reused');
    },
    onBeforeBuild: () => calls.push('handoff'),
    buildStepCollector: (buildArgs: string[]) => {
      calls.push(`build:${buildArgs.join(' ')}`);
      return okStep('Full build');
    },
  });

  expect(result.buildArgs).toEqual(['--commit', '-m', 'Closeout commit', '--reuse-build']);
  expect(calls).toEqual([
    'checkpoint-state',
    'build-state',
    'handoff',
    'build:--commit -m Closeout commit --reuse-build',
  ]);
});

it('does not run build when checkpoint fails', async () => {
  const module = await import('./closeout.mjs');
  const calls: string[] = [];
  const result = await module.runCloseout({
    argv: ['-m', 'Blocked closeout'],
    executionContractAsserter: ignoreExecutionContract,
    checkpointStateAsserter: () => {
      throw new Error('stale checkpoint state');
    },
    contextCollector: closeoutContext,
    checkpointRunner: async () => {
      calls.push('checkpoint');
      return checkpointResult(false);
    },
    buildStepCollector: () => {
      calls.push('build');
      return okStep('Full build');
    },
  });

  expect(result.readyForBuild).toBe(false);
  expect(result.steps.map((step) => step.label)).toEqual(['Format', 'Advisory report', 'Oxlint']);
  expect(calls).toEqual(['checkpoint']);
});
