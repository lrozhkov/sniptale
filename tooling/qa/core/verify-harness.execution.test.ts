import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from './test-helpers';
import { createHarnessUnitTestRequest } from './verify-harness.execution.mjs';
import { collectRuntimeListenerStep } from './verify-harness.runtime-listener-step.mjs';

it('runs exact changed and owner-local harness tests without broad sibling or graph fan-out', () => {
  expect(
    createHarnessUnitTestRequest({
      harnessTargetFiles: [
        'tooling/configs/qa/retired-controls.data.json',
        'tooling/qa/core/verify-target-only-paths.mjs',
      ],
    })
  ).toEqual({
    directFiles: ['tooling/qa/core/verify-target-only-paths.test.ts'],
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
  expect(createHarnessUnitTestRequest({ harnessTargetFiles: [sourceFile] })).toEqual({
    directFiles: [testFile],
    suite: 'harness',
  });
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
