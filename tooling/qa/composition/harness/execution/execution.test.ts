import { expect, it, vi } from 'vitest';

import {
  collectCompositionIntegrityViolations,
  collectHarnessFormatterStep,
  collectHarnessStaticLane,
  collectHarnessStepResults,
  createHarnessUnitTestRequest,
  shouldRunHarnessTypecheck,
} from './execution.mjs';

it('formats the harness diff before scheduling verification', async () => {
  const formatterWriter = vi.fn(() => ({
    candidateFiles: ['apps/extension/src/example.ts', 'tooling/qa/example.mjs'],
    writtenFiles: ['apps/extension/src/example.ts', 'tooling/qa/example.mjs'],
  }));

  await expect(
    collectHarnessFormatterStep(
      {
        allExistingTargetFiles: ['apps/extension/src/example.ts', 'tooling/qa/example.mjs'],
        existingTargetFiles: ['tooling/qa/example.mjs'],
      },
      { formatterWriter }
    )
  ).resolves.toMatchObject({
    label: 'Format',
    status: 'ok',
    detail: 'formatted=2; barrier=sequential-before-verification',
  });
  expect(formatterWriter).toHaveBeenCalledWith([
    'apps/extension/src/example.ts',
    'tooling/qa/example.mjs',
  ]);
});

const compositionControl = {
  id: 'qa.rule.example',
  kind: 'node',
  lanes: ['harness'],
  semanticClass: 'wrapper / CI composition',
  source: 'tooling/qa/composition/example.mjs',
  tool: 'example.mjs',
  owner: 'qa-platform',
  ruleDoc: 'docs/tooling/wrapper-summary.md',
  remediation: 'Run the exact composition owner proof.',
  truthSource: 'fixture',
  sourceExists: true,
  proofFiles: ['tooling/qa/composition/example.test.ts'],
};

function compositionDiscoveryFixture() {
  return {
    controls: [compositionControl],
    executables: [],
    packageQaScripts: [],
    policyFiles: [
      {
        path: 'tooling/configs/qa/example.data.json',
        consumers: ['tooling/qa/composition/example.mjs'],
      },
    ],
    validationClaims: [],
  };
}

function compositionPolicyFixture() {
  return {
    $comment: 'Only real exceptions are checked in.',
    schemaVersion: 4,
    exceptions: [] as Array<{ kind: string; path: string; rationale: string }>,
  };
}

it.each([
  {
    expectedRule: 'qa-executable-orphan',
    mutate: ({ discovery }: { discovery: ReturnType<typeof compositionDiscoveryFixture> }) => {
      discovery.executables.push({
        path: 'tooling/qa/composition/orphan.mjs',
        controlIds: [],
        scriptIds: [],
        origins: ['ast-entry:tooling/qa/composition/orphan.mjs#canonical-js-entry'],
        entrypointKind: 'guarded',
        importSafety: 'safe',
      });
    },
    name: 'new orphan executable',
  },
  {
    expectedRule: 'qa-control-policy-exception-stale',
    mutate: ({ policy }: { policy: ReturnType<typeof compositionPolicyFixture> }) => {
      policy.exceptions.push({
        kind: 'orphan-executable',
        path: 'tooling/qa/composition/removed.mjs',
        rationale: 'Fixture stale exception.',
      });
    },
    name: 'stale exception decision',
  },
  {
    expectedRule: 'qa-policy-file-no-consumer',
    mutate: ({ discovery }: { discovery: ReturnType<typeof compositionDiscoveryFixture> }) => {
      discovery.policyFiles[0].consumers = [];
    },
    name: 'consumerless policy',
  },
])('exposes $name through harness composition integrity', ({ expectedRule, mutate }) => {
  const discovery = compositionDiscoveryFixture();
  const policy = compositionPolicyFixture();
  mutate({ discovery, policy });

  expect(
    collectCompositionIntegrityViolations({
      catalog: [{}],
      discovery,
      policy,
      policyOptions: { readSource: () => '' },
    }).map(({ rule }) => rule)
  ).toContain(expectedRule);
});

it('runs exact changed and owner-local harness tests without broad sibling or graph fan-out', () => {
  expect(
    createHarnessUnitTestRequest(
      {
        harnessTargetFiles: ['tooling/qa/policy/targets/verify-target-only-paths.mjs'],
      },
      { maxWorkers: 4 }
    )
  ).toEqual({
    directFiles: ['tooling/qa/policy/targets/verify-target-only-paths.test.ts'],
    maxWorkers: 4,
    suite: 'harness',
  });
});

it.each([
  [
    'tooling/qa/audits/supply-chain/npm-audit.mjs',
    'tooling/qa/audits/supply-chain/npm-audit.test.ts',
  ],
  [
    'tooling/qa/composition/build/build-step.mjs',
    'tooling/qa/composition/build/build-step.test.ts',
  ],
  ['tooling/release/package/package-dist.mjs', 'tooling/release/package/package-dist.test.ts'],
  [
    'tooling/qa/guards/architecture/architecture-guardrails/check.mjs',
    'tooling/qa/guards/architecture/architecture-guardrails/check.test.ts',
  ],
])('selects exact lifecycle owner proof for %s', (sourceFile, testFile) => {
  expect(
    createHarnessUnitTestRequest({ harnessTargetFiles: [sourceFile] }, { maxWorkers: 4 })
  ).toEqual({
    directFiles: [testFile],
    maxWorkers: 4,
    suite: 'harness',
  });
});

it('keeps the static lane limited to composition integrity and dependency admission', async () => {
  const result = await collectHarnessStaticLane(
    { harnessTargetFiles: ['tooling/qa/composition/harness/execution/execution.mjs'] },
    {
      collectors: {
        collectCompositionIntegrityStep: () => ({
          label: 'QA composition integrity',
          status: 'ok' as const,
        }),
        collectDependencyAdmissionStep: () => ({
          label: 'Dependency admission',
          status: 'skipped' as const,
        }),
      },
    }
  );

  expect(result.steps.map(({ label }) => label)).toEqual([
    'QA composition integrity',
    'Dependency admission',
  ]);
  expect(result.steps).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: 'Structural risk' }),
      expect.objectContaining({ label: 'Audit' }),
    ])
  );
});

it('runs harness typecheck for typecheck-control changes, not unrelated harness code', () => {
  expect(
    shouldRunHarnessTypecheck({
      harnessTargetFiles: ['tooling/qa/proof/typecheck/typecheck-project-map.mjs'],
    })
  ).toBe(true);
  expect(shouldRunHarnessTypecheck({ harnessTargetFiles: ['package.json'] })).toBe(true);
  expect(
    shouldRunHarnessTypecheck({ harnessTargetFiles: ['tooling/qa/wrappers/checkpoint.test.ts'] })
  ).toBe(false);
});

it('awaits the format barrier before scheduling any harness lane', async () => {
  let releaseFormat: ((value: { label: string; status: 'ok' }) => void) | undefined;
  const formatResult = new Promise<{ label: string; status: 'ok' }>((resolve) => {
    releaseFormat = resolve;
  });
  const scheduledStepCollector = vi.fn(async () => [{ label: 'Oxlint', status: 'ok' as const }]);
  const result = collectHarnessStepResults({
    context: {
      harnessTargetFiles: ['tooling/qa/core/example.mjs'],
      harnessVerificationTargetFiles: ['tooling/qa/core/example.mjs'],
    },
    collectors: { collectFormatterStep: () => formatResult },
    scheduledStepCollector,
  });

  await Promise.resolve();
  expect(scheduledStepCollector).not.toHaveBeenCalled();
  releaseFormat?.({ label: 'Format', status: 'ok' });

  await expect(result).resolves.toMatchObject({
    steps: [{ label: 'Format' }, { label: 'Oxlint' }],
  });
  expect(scheduledStepCollector).toHaveBeenCalledOnce();
});

it('does not schedule harness lanes when the format barrier fails', async () => {
  const scheduledStepCollector = vi.fn();
  const result = await collectHarnessStepResults({
    context: {
      harnessTargetFiles: ['tooling/qa/core/example.mjs'],
      harnessVerificationTargetFiles: ['tooling/qa/core/example.mjs'],
    },
    collectors: {
      collectFormatterStep: async () => ({ label: 'Format', status: 'failed' as const }),
    },
    scheduledStepCollector,
  });

  expect(result.steps).toEqual([{ label: 'Format', status: 'failed' }]);
  expect(scheduledStepCollector).not.toHaveBeenCalled();
});
