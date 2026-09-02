import { expect, it, vi } from 'vitest';

import { createTempRoot, importFresh, withCwd, writeJson } from '../test-support/test-helpers';
import { parseCheckpointOptions } from './checkpoint.mjs';

const ignoreExecutionContract = () => {};
const COVERAGE_ROLLOUT_INVENTORY = 'tooling/qa/proof/coverage/test-coverage/rollout-files.data.mjs';

function createCheckpointTempRoot(prefix: string) {
  const root = createTempRoot(prefix);
  writeJson(root, 'tooling/configs/qa/quality-baseline.json', {
    schemaVersion: 2,
    rationales: [],
    allowances: [],
  });
  return root;
}

function context(fingerprint: string, targetFile = 'src/example.ts') {
  return {
    targetFiles: [targetFile],
    existingTargetFiles: [targetFile],
    codeFiles: [targetFile],
    jsLikeFiles: [targetFile],
    fingerprint,
  };
}

function mixedContext(fingerprint: string) {
  return {
    targetFiles: ['src/example.ts', 'tooling/qa/core/example.test.ts'],
    existingTargetFiles: ['src/example.ts', 'tooling/qa/core/example.test.ts'],
    codeFiles: ['src/example.ts', 'tooling/qa/core/example.test.ts'],
    jsLikeFiles: ['src/example.ts', 'tooling/qa/core/example.test.ts'],
    fingerprint,
  };
}

function okStep(label: string) {
  return {
    label,
    status: 'ok' as const,
    detail: '',
    durationMs: 0,
  };
}

async function runGreenCheckpointFlow(module: typeof import('./checkpoint.mjs'), calls: string[]) {
  const contexts = [
    context('before-format', 'src/before-format.ts'),
    context('after-format', 'src/after-format.ts'),
  ];
  const result = await module.runCheckpoint({
    producerRunId: 'checkpoint-test-run-1',
    executionContractAsserter: ignoreExecutionContract,
    contextCollector: () => contexts.shift() ?? context('after-format'),
    formatStepCollector: () => {
      calls.push('format');
      return okStep('Format');
    },
    advisoryStepCollector: (currentContext) => {
      calls.push(`advisory:${currentContext.targetFiles.join(',')}`);
      return okStep('Advisory report');
    },
    focusedStepCollector: async (currentContext) => {
      calls.push(`focused:${currentContext.targetFiles.join(',')}`);
      return [okStep('Oxlint'), okStep('ESLint')];
    },
  });

  return result;
}

it('keeps qa:checkpoint focused and non-committing', () => {
  expect(parseCheckpointOptions([])).toEqual({
    files: [],
  });
  expect(() => parseCheckpointOptions(['-m', 'Verified wrapper flow'])).toThrow(
    /does not create commits/u
  );
  expect(() => parseCheckpointOptions(['--commit'])).toThrow(/does not create commits/u);
}, 10_000);

it('formats and reports focused steps without invoking build', async () => {
  const root = createCheckpointTempRoot('qa-checkpoint-flow-');
  const calls: string[] = [];

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./checkpoint.mjs')>(
      './checkpoint.mjs',
      import.meta.url
    );
    const result = await runGreenCheckpointFlow(module, calls);

    expect(result.steps.map((step) => step.label)).toEqual([
      'Format',
      'Advisory report',
      'Oxlint',
      'ESLint',
    ]);
    expect(result.readyForBuild).toBe(true);
  });

  expect(calls).toEqual(['format', 'advisory:src/after-format.ts', 'focused:src/after-format.ts']);
});

it('awaits the asynchronous formatter barrier before collecting verification context', async () => {
  const root = createCheckpointTempRoot('qa-checkpoint-format-barrier-');
  const calls: string[] = [];
  let releaseFormat: (step: ReturnType<typeof okStep>) => void = () => {};
  const formatResult = new Promise<ReturnType<typeof okStep>>((resolve) => {
    releaseFormat = resolve;
  });

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./checkpoint.mjs')>(
      './checkpoint.mjs',
      import.meta.url
    );
    const contexts = [
      context('before-format', 'src/before-format.ts'),
      context('after-format', 'src/after-format.ts'),
    ];
    const checkpointResult = module.runCheckpoint({
      producerRunId: 'checkpoint-test-format-barrier',
      executionContractAsserter: ignoreExecutionContract,
      contextCollector: () => contexts.shift() ?? context('after-format'),
      formatStepCollector: () => {
        calls.push('format');
        return formatResult;
      },
      advisoryStepCollector: () => {
        calls.push('advisory');
        return okStep('Advisory report');
      },
      focusedStepCollector: async (currentContext) => {
        calls.push(`focused:${currentContext.targetFiles.join(',')}`);
        return [okStep('Oxlint')];
      },
    });

    expect(calls).toEqual(['format']);
    releaseFormat(okStep('Format'));
    await checkpointResult;
  });

  expect(calls).toEqual(['format', 'advisory', 'focused:src/after-format.ts']);
});

it('keeps focused verification blocking when advisory collection reports failure', async () => {
  const root = createCheckpointTempRoot('qa-checkpoint-advisory-fail-');
  const calls: string[] = [];

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./checkpoint.mjs')>(
      './checkpoint.mjs',
      import.meta.url
    );
    const result = await module.runCheckpoint({
      producerRunId: 'checkpoint-test-advisory-fail',
      executionContractAsserter: ignoreExecutionContract,
      contextCollector: () => context('same-diff'),
      formatStepCollector: () => okStep('Format'),
      advisoryStepCollector: () => {
        calls.push('advisory');
        return {
          label: 'Advisory report',
          status: 'failed' as const,
          summary: 'failed',
          durationMs: 0,
        };
      },
      focusedStepCollector: async () => {
        calls.push('focused');
        return [okStep('Oxlint')];
      },
    });

    expect(result.steps.map((step) => [step.label, step.status])).toEqual([
      ['Format', 'ok'],
      ['Advisory report', 'skipped'],
      ['Oxlint', 'ok'],
    ]);
    expect(result.readyForBuild).toBe(true);
  });

  expect(calls).toEqual(['advisory', 'focused']);
});

it('keeps focused verification blocking when advisory collection throws', async () => {
  const root = createCheckpointTempRoot('qa-checkpoint-advisory-throw-');
  const calls: string[] = [];

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./checkpoint.mjs')>(
      './checkpoint.mjs',
      import.meta.url
    );
    const result = await module.runCheckpoint({
      producerRunId: 'checkpoint-test-advisory-throw',
      executionContractAsserter: ignoreExecutionContract,
      contextCollector: () => context('same-diff'),
      formatStepCollector: () => okStep('Format'),
      advisoryStepCollector: () => {
        throw new Error('report storage unavailable');
      },
      focusedStepCollector: async () => {
        calls.push('focused');
        return [okStep('Oxlint')];
      },
    });

    expect(result.steps).toEqual([
      expect.objectContaining({ label: 'Format', status: 'ok' }),
      expect.objectContaining({
        label: 'Advisory report',
        status: 'skipped',
        detail: expect.stringContaining('report storage unavailable'),
      }),
      expect.objectContaining({ label: 'Oxlint', status: 'ok' }),
    ]);
    expect(result.readyForBuild).toBe(true);
  });

  expect(calls).toEqual(['focused']);
});

it('does not run qa:build when focused checks fail', async () => {
  const root = createCheckpointTempRoot('qa-checkpoint-fail-');
  const calls: string[] = [];

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./checkpoint.mjs')>(
      './checkpoint.mjs',
      import.meta.url
    );
    const result = await module.runCheckpoint({
      producerRunId: 'checkpoint-test-run-2',
      executionContractAsserter: ignoreExecutionContract,
      contextCollector: () => context('same-diff'),
      formatStepCollector: () => okStep('Format'),
      advisoryStepCollector: () => okStep('Advisory report'),
      focusedStepCollector: async () => [
        {
          label: 'Oxlint',
          status: 'failed' as const,
          summary: 'failed',
          durationMs: 0,
        },
      ],
    });

    expect(result.steps.map((step) => [step.label, step.status])).toEqual([
      ['Format', 'ok'],
      ['Advisory report', 'ok'],
      ['Oxlint', 'failed'],
    ]);
    expect(result.readyForBuild).toBe(false);
  });

  expect(calls).toEqual([]);
});

it('does not run advisory, focused checks, or build when formatting fails', async () => {
  const root = createCheckpointTempRoot('qa-checkpoint-format-fail-');
  const calls: string[] = [];

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./checkpoint.mjs')>(
      './checkpoint.mjs',
      import.meta.url
    );
    const result = await module.runCheckpoint({
      producerRunId: 'checkpoint-test-run-3',
      executionContractAsserter: ignoreExecutionContract,
      contextCollector: () => context('same-diff'),
      formatStepCollector: () => ({
        label: 'Format',
        status: 'failed' as const,
        summary: 'failed',
        durationMs: 0,
      }),
      advisoryStepCollector: () => {
        calls.push('advisory');
        return okStep('Advisory report');
      },
      focusedStepCollector: async () => {
        calls.push('focused');
        return [okStep('Oxlint')];
      },
    });

    expect(result.steps.map((step) => [step.label, step.status])).toEqual([['Format', 'failed']]);
    expect(result.readyForBuild).toBe(false);
  });

  expect(calls).toEqual([]);
});

it('requires a fresh release-harness stamp when harness files changed', async () => {
  const root = createCheckpointTempRoot('qa-checkpoint-harness-stale-');

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./checkpoint.mjs')>(
      './checkpoint.mjs',
      import.meta.url
    );
    const result = await module.runCheckpoint({
      producerRunId: 'checkpoint-test-run-4',
      executionContractAsserter: ignoreExecutionContract,
      contextCollector: () => mixedContext('same-diff'),
      formatStepCollector: () => okStep('Format'),
      harnessStateAsserter: () => {
        throw new Error('stale harness state');
      },
      advisoryStepCollector: () => okStep('Advisory report'),
      focusedStepCollector: async () => [okStep('Oxlint')],
    });

    expect(result.steps.map((step) => [step.label, step.status])).toEqual([
      ['Format', 'ok'],
      ['Harness QA', 'failed'],
    ]);
    expect(result.readyForBuild).toBe(false);
  });
});

it('keeps harness-only checkpoint ready for build after a fresh harness stamp', async () => {
  const root = createCheckpointTempRoot('qa-checkpoint-harness-only-');

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./checkpoint.mjs')>(
      './checkpoint.mjs',
      import.meta.url
    );
    const result = await module.runCheckpoint({
      producerRunId: 'checkpoint-test-run-5',
      contextCollector: () => ({
        targetFiles: ['tooling/qa/core/example.test.ts'],
        existingTargetFiles: ['tooling/qa/core/example.test.ts'],
        codeFiles: ['tooling/qa/core/example.test.ts'],
        jsLikeFiles: ['tooling/qa/core/example.test.ts'],
        fingerprint: 'same-diff',
      }),
      formatStepCollector: () => okStep('Format'),
      harnessInventoryViolationCollector: () => [],
      harnessStateAsserter: () => undefined,
      advisoryStepCollector: () => {
        throw new Error('advisory should not run without product targets');
      },
      focusedStepCollector: async () => {
        throw new Error('focused checks should not run without product targets');
      },
    });

    expect(result.steps.map((step) => step.label)).toEqual(['Format', 'Harness QA']);
    expect(result.executionMode).toBe('harness-only');
    expect(result.readyForBuild).toBe(true);
  });
});

it.each([
  {
    exactFiles: null,
    expectedMessage: 'must export an object keyed by rollout group',
    name: 'an invalid top-level schema',
  },
  {
    exactFiles: { coreRuntimeOwners: 'not-an-array' },
    expectedMessage: 'group coreRuntimeOwners must be an array',
    name: 'missing and non-array rollout groups',
  },
])('rejects $name through the checkpoint inventory owner path', async (scenario) => {
  const root = createCheckpointTempRoot('qa-checkpoint-coverage-inventory-invalid-');
  const harnessStateAsserter = vi.fn(() => {
    throw new Error('inventory-only scope must not consult harness state');
  });
  vi.doMock('../proof/coverage/test-coverage/rollout-files.data.mjs', () => ({
    COVERAGE_ROLLOUT_EXACT_FILES: scenario.exactFiles,
  }));

  try {
    await withCwd(root, async () => {
      const module = await importFresh<typeof import('./checkpoint.mjs')>(
        './checkpoint.mjs',
        import.meta.url
      );
      const result = await module.runCheckpoint({
        producerRunId: 'checkpoint-invalid-coverage-inventory',
        contextCollector: () => ({
          codeFiles: [COVERAGE_ROLLOUT_INVENTORY],
          existingTargetFiles: [COVERAGE_ROLLOUT_INVENTORY],
          fingerprint: 'invalid-coverage-inventory',
          jsLikeFiles: [COVERAGE_ROLLOUT_INVENTORY],
          targetFiles: [COVERAGE_ROLLOUT_INVENTORY],
        }),
        executionContractAsserter: ignoreExecutionContract,
        formatStepCollector: () => okStep('Format'),
        harnessStateAsserter,
        stateWriter: () => {},
      });

      expect(result.steps.map((step) => [step.label, step.status])).toEqual([
        ['Format', 'ok'],
        ['Harness QA', 'failed'],
      ]);
      expect(result.steps[1]).toMatchObject({
        violations: expect.arrayContaining([
          expect.objectContaining({ rule: 'coverage-rollout-inventory' }),
        ]),
      });
      expect(result.steps[1]?.violations?.map((violation) => violation.message)).toEqual(
        expect.arrayContaining([expect.stringContaining(scenario.expectedMessage)])
      );
      expect(result.readyForBuild).toBe(false);
    });
  } finally {
    vi.doUnmock('../core/verify-test-coverage.rollout-files.data.mjs');
  }

  expect(harnessStateAsserter).not.toHaveBeenCalled();
});

it('records a deterministic clean-tree skip with the dedicated wrapper marker contract', async () => {
  const module = await import('./checkpoint.mjs');
  const writtenStates: Array<{ skipped: boolean }> = [];
  const result = await module.runCheckpoint({
    producerRunId: 'checkpoint-clean-run',
    contextCollector: () => ({ targetFiles: [], existingTargetFiles: [] }),
    formatStepCollector: () => ({ ...okStep('Format'), status: 'skipped' as const }),
    stateWriter: (state) => writtenStates.push(state),
  });

  expect(result).toMatchObject({ executionMode: 'no-targets', skipped: true });
  expect(writtenStates).toEqual([expect.objectContaining({ skipped: true })]);
});

it('does not publish checkpoint state when the canonical population rejects the result', async () => {
  const module = await import('./checkpoint.mjs');
  const writtenStates: unknown[] = [];

  await expect(
    module.runCheckpoint({
      producerRunId: 'checkpoint-rejected-run',
      contextCollector: () => ({ targetFiles: [], existingTargetFiles: [] }),
      formatStepCollector: () => ({ ...okStep('Format'), status: 'skipped' as const }),
      executionContractAsserter: () => {
        throw new Error('injected contract rejection');
      },
      stateWriter: (state) => writtenStates.push(state),
    })
  ).rejects.toThrow(/injected contract rejection/u);
  expect(writtenStates).toEqual([]);
});
