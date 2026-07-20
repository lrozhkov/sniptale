import { expect, it, vi } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from './test-helpers';

function writeMixedFocusedFixture(root: string) {
  writeFile(
    root,
    'apps/extension/src/popup/shell/export/runtime/type-only.ts',
    [
      "import type { PopupExportState } from './session';",
      'export function run(state: PopupExportState) {',
      '  return state.id;',
      '}',
      '',
    ].join('\n')
  );
  writeFile(
    root,
    'apps/extension/src/popup/shell/export/controller.ts',
    'export const value = 1;\n'
  );
}

function updateMixedFocusedFixture(root: string) {
  writeFile(
    root,
    'apps/extension/src/popup/shell/export/runtime/type-only.ts',
    [
      "import type { PopupExportRuntimeContract } from './state';",
      'export function run(state: PopupExportRuntimeContract) {',
      '  return state.id;',
      '}',
      '',
    ].join('\n')
  );
  writeFile(
    root,
    'apps/extension/src/popup/shell/export/controller.ts',
    'export const value = 2;\n'
  );
}

function createFocusedScopeOverride() {
  return {
    counts: { coverageTargets: 1, ownerTests: 1, tests: 1 },
    coverageTargetFiles: ['apps/extension/src/popup/shell/export/controller.ts'],
    detail: 'local owner tests=1; coverageTargets=1',
    directTestFiles: [],
    ownerTestsByFile: new Map([
      ['apps/extension/src/popup/shell/export/controller.ts', ['owner.test.ts']],
    ]),
    reasons: [],
    testFiles: ['owner.test.ts'],
    verdict: 'run-local-coverage' as const,
  };
}

it('excludes type-only production diffs from mixed focused coverage targets', async () => {
  const root = createTempRoot('focused-type-only-mixed-code-');
  initGitRepo(root);
  writeMixedFocusedFixture(root);
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  updateMixedFocusedFixture(root);

  const runTestCoverageCheck = vi.fn(() => ({ error: null, skipped: false, violations: [] }));
  const runUnitTests = vi.fn(() => ({ status: 0, stderr: '', stdout: '' }));
  vi.doMock('./verify-test-coverage.mjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./verify-test-coverage.mjs')>()),
    runTestCoverageCheck,
  }));

  await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-focused.test-steps.mjs')>(
      './verify-focused.test-steps.mjs',
      import.meta.url
    );
    await module.runFocusedUnitTests(
      {
        codeFiles: [
          'apps/extension/src/popup/shell/export/runtime/type-only.ts',
          'apps/extension/src/popup/shell/export/controller.ts',
        ],
        targetFiles: [
          'apps/extension/src/popup/shell/export/runtime/type-only.ts',
          'apps/extension/src/popup/shell/export/controller.ts',
        ],
      },
      {
        focusedScopeOverride: createFocusedScopeOverride(),
        runUnitTestsImpl: runUnitTests,
      }
    );
  });

  expect(runTestCoverageCheck).toHaveBeenCalledWith({
    files: ['apps/extension/src/popup/shell/export/controller.ts'],
  });
});
