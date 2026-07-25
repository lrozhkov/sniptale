import { expect, it, vi } from 'vitest';

import { createTempRoot, writeFile } from './test-helpers';
import {
  collectHarnessStepResults,
  createHarnessUnitTestRequest,
  shouldRunHarnessAudit,
} from './verify-harness.execution.mjs';
import { collectRuntimeListenerStep } from './verify-harness.runtime-listener-step.mjs';

it('runs exact changed and owner-local harness tests without broad sibling or graph fan-out', () => {
  expect(
    createHarnessUnitTestRequest(
      {
        harnessTargetFiles: [
          'tooling/configs/qa/retired-controls.data.json',
          'tooling/qa/core/verify-target-only-paths.mjs',
        ],
      },
      { maxWorkers: 4 }
    )
  ).toEqual({
    directFiles: ['tooling/qa/core/verify-target-only-paths.test.ts'],
    maxWorkers: 4,
    suite: 'harness',
  });
});

it.each([
  ['tooling/qa/core/verify-audit.mjs', 'tooling/qa/core/verify-audit.test.ts'],
  ['tooling/qa/core/verify-build.mjs', 'tooling/qa/core/verify-build.test.ts'],
  ['tooling/release/package-dist.mjs', 'tooling/release/package-dist.test.ts'],
  [
    'tooling/qa/core/verify-architecture-guardrails.mjs',
    'tooling/qa/core/verify-architecture-guardrails.test.ts',
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

it('runs the live audit only for dependency-authority changes', () => {
  expect(shouldRunHarnessAudit(['package-lock.json'])).toBe(true);
  expect(shouldRunHarnessAudit(['tooling/qa/core/verify-harness.execution.mjs'])).toBe(false);
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
    collectors: { collectPrettierStep: () => formatResult },
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
      collectPrettierStep: async () => ({ label: 'Format', status: 'failed' as const }),
    },
    scheduledStepCollector,
  });

  expect(result.steps).toEqual([{ label: 'Format', status: 'failed' }]);
  expect(scheduledStepCollector).not.toHaveBeenCalled();
});

it('blocks direct runtime listener registration in changed harness code', () => {
  const root = createTempRoot('harness-runtime-listener-');
  const file = writeFile(
    root,
    'browser-mocks.test.ts',
    'chrome.runtime.onMessage.addListener(() => undefined);\n'
  );

  expect(
    collectRuntimeListenerStep({
      codeFiles: [file],
      qualityCodeFiles: [file],
    })
  ).toMatchObject({
    label: 'Runtime listener ownership',
    status: 'failed',
    violations: [{ rule: 'runtime-listener-seam' }],
  });
});
