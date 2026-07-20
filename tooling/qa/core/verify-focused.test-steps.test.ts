import { afterEach, expect, it, vi } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from './test-helpers';

function writeRouteImportFixture(root: string, importPath: string) {
  writeFile(
    root,
    'apps/extension/src/background/runtime/routing/route.ts',
    `import { MessageType } from '${importPath}';\nexport const route = MessageType.START_CAPTURE;\n`
  );
}

function writeRouteTestFixture(root: string, testName: string) {
  writeFile(
    root,
    'apps/extension/src/background/runtime/routing/route.test.ts',
    `import { expect, it } from 'vitest';

it('${testName}', () => {
  expect(true).toBe(true);
});
`
  );
}

function createImportOnlyCodeWithChangedTestFixture() {
  const root = createTempRoot('focused-import-only-code-with-test-');
  initGitRepo(root);
  writeRouteImportFixture(root, '../../shared/types');
  writeRouteTestFixture(root, 'keeps route visible');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeRouteImportFixture(root, '../../shared/contracts/messaging/message-types');
  writeRouteTestFixture(root, 'keeps route visible after import migration');
  return root;
}

afterEach(() => {
  vi.doUnmock('./focused-coverage-owner-resolver.mjs');
  vi.doUnmock('./verify-test-coverage.mjs');
  vi.doUnmock('./verify-unit-tests.mjs');
  vi.resetModules();
});

it('does not invoke Vitest coverage when focused owner scope is deferred', async () => {
  const runUnitTests = vi.fn(() => ({ status: 0, stderr: '', stdout: '' }));
  vi.doMock('./verify-unit-tests.mjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./verify-unit-tests.mjs')>()),
    runUnitTests,
  }));
  const module = await importFresh<typeof import('./verify-focused.test-steps.mjs')>(
    './verify-focused.test-steps.mjs'
  );

  const steps = await module.runFocusedUnitTests({
    codeFiles: ['apps/extension/src/content/selection/callout/view.tsx'],
    targetFiles: ['apps/extension/src/content/selection/callout/view.tsx'],
  });

  expect(runUnitTests).not.toHaveBeenCalled();
  expect(steps.map((step) => [step.label, step.status, step.summary ?? step.detail])).toEqual([
    ['Unit tests', 'skipped', 'skipped: no local test owner in diff'],
    ['Test coverage', 'skipped', expect.stringContaining('deferred to qa:audit')],
  ]);
});

it('blocks ambiguous focused proof for high-risk runtime and persistence owners', async () => {
  const runUnitTests = vi.fn(() => ({ status: 0, stderr: '', stdout: '' }));
  vi.doMock('./verify-unit-tests.mjs', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./verify-unit-tests.mjs')>()),
    runUnitTests,
  }));
  const module = await importFresh<typeof import('./verify-focused.test-steps.mjs')>(
    './verify-focused.test-steps.mjs'
  );

  const steps = await module.runFocusedUnitTests({
    codeFiles: ['apps/extension/src/contracts/messaging/runtime-message/core.ts'],
    targetFiles: ['apps/extension/src/contracts/messaging/runtime-message/core.ts'],
  });

  expect(runUnitTests).not.toHaveBeenCalled();
  expect(steps.map((step) => [step.label, step.status, step.summary ?? step.detail])).toEqual([
    ['Unit tests', 'failed', 'high-risk focused proof is ambiguous'],
    ['Test coverage', 'skipped', 'blocked: ambiguous high-risk proof'],
  ]);
  expect(steps[0].stderr).toContain('High-risk focused proof cannot be deferred');
});

it('does not treat runtime-state authority inventory path updates as high-risk proof owners', async () => {
  const module = await importFresh<typeof import('./verify-focused.high-risk-proof.helpers.mjs')>(
    './verify-focused.high-risk-proof.helpers.mjs'
  );

  expect(
    module.isHighRiskFocusedProofFile(
      'apps/extension/src/background/application/runtime-state/authority-flows-support.ts'
    )
  ).toBe(false);
  expect(
    module.isHighRiskFocusedProofFile('apps/extension/src/background/runtime/routing/index.ts')
  ).toBe(true);
  expect(
    module.isHighRiskFocusedProofFile(
      'apps/extension/src/settings/sections/ai-providers/controller/save.ts'
    )
  ).toBe(true);
});

it('fails fast for new coverage-eligible production files without local test ownership', async () => {
  const root = createTempRoot('focused-new-without-owner-');
  writeFile(
    root,
    'apps/extension/src/content/selection/callout/new-surface.tsx',
    'export const value = 1;\n'
  );

  const steps = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-focused.test-steps.mjs')>(
      './verify-focused.test-steps.mjs',
      import.meta.url
    );
    return module.runFocusedUnitTests({
      codeFiles: ['apps/extension/src/content/selection/callout/new-surface.tsx'],
      newFiles: ['apps/extension/src/content/selection/callout/new-surface.tsx'],
      targetFiles: ['apps/extension/src/content/selection/callout/new-surface.tsx'],
    });
  });

  expect(steps.map((step) => [step.label, step.status])).toEqual([
    ['Unit tests', 'failed'],
    ['Test coverage', 'skipped'],
  ]);
  expect(steps[0].stderr).toContain('new files without local test owner');
});

it('excludes harness tests from product focused direct tests', async () => {
  const root = createTempRoot('focused-product-tests-');
  const productTestFile =
    'apps/extension/src/composition/persistence/page-style/storage/index.test.ts';
  writeFile(root, productTestFile, "import { expect } from 'vitest';\nexpect(true).toBe(true);\n");

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-focused.test-steps.mjs')>(
      './verify-focused.test-steps.mjs',
      import.meta.url
    );
    return module.collectFocusedDiffTestFiles([
      productTestFile,
      'tooling/qa/core/verify-focused.test-steps.test.ts',
    ]);
  });

  expect(result).toEqual([productTestFile]);
});

it('excludes import-only product test diffs from focused direct tests', async () => {
  const root = createTempRoot('focused-import-only-test-');
  initGitRepo(root);
  writeFile(
    root,
    'apps/extension/src/composition/persistence/page-style/storage/index.test.ts',
    "import { value } from './legacy';\nexpect(value).toBeTruthy();\n"
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeFile(
    root,
    'apps/extension/src/composition/persistence/page-style/storage/index.test.ts',
    "import { value } from './owner';\nexpect(value).toBeTruthy();\n"
  );

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-focused.test-steps.mjs')>(
      './verify-focused.test-steps.mjs',
      import.meta.url
    );
    return module.collectFocusedDiffTestFiles([
      'apps/extension/src/composition/persistence/page-style/storage/index.test.ts',
    ]);
  });

  expect(result).toEqual([]);
});

it('does not require focused owner proof for import-only production diffs', async () => {
  const root = createTempRoot('focused-import-only-code-');
  initGitRepo(root);
  writeRouteImportFixture(root, '../../shared/types');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeRouteImportFixture(root, '../../shared/contracts/messaging/message-types');

  const steps = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-focused.test-steps.mjs')>(
      './verify-focused.test-steps.mjs',
      import.meta.url
    );
    return module.runFocusedUnitTests({
      codeFiles: ['apps/extension/src/background/runtime/routing/route.ts'],
      targetFiles: ['apps/extension/src/background/runtime/routing/route.ts'],
    });
  });

  expect(steps.map((step) => [step.label, step.status, step.summary ?? step.detail])).toEqual([
    ['Unit tests', 'skipped', 'skipped: import-only code diff'],
    ['Test coverage', 'skipped', 'skipped: no changed production files in rollout scope'],
  ]);
});

it('runs changed product tests without coverage for import-only production diffs', async () => {
  const root = createImportOnlyCodeWithChangedTestFixture();
  const runUnitTests = vi.fn(() => ({ status: 0, stderr: '', stdout: '' }));
  const steps = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-focused.test-steps.mjs')>(
      './verify-focused.test-steps.mjs',
      import.meta.url
    );
    return module.runFocusedUnitTests(
      {
        codeFiles: ['apps/extension/src/background/runtime/routing/route.ts'],
        targetFiles: [
          'apps/extension/src/background/runtime/routing/route.ts',
          'apps/extension/src/background/runtime/routing/route.test.ts',
        ],
      },
      { runUnitTestsImpl: runUnitTests }
    );
  });

  expect(runUnitTests).toHaveBeenCalledWith(
    expect.objectContaining({
      coverage: false,
      coverageMode: 'diff',
      coverageTargets: [],
      directFiles: ['apps/extension/src/background/runtime/routing/route.test.ts'],
    })
  );
  expect(steps.map((step) => [step.label, step.status, step.summary ?? step.detail])).toEqual([
    ['Unit tests', 'ok', 'profile=checkpoint-direct; direct tests=1'],
    ['Test coverage', 'skipped', 'skipped: import-only code diff'],
  ]);
});
