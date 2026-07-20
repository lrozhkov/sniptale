import { expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd, writeFile } from './test-helpers';

async function importResolver() {
  return importFresh<typeof import('./focused-coverage-owner-resolver.mjs')>(
    './focused-coverage-owner-resolver.mjs',
    import.meta.url
  );
}

async function importOwnerTests() {
  return importFresh<typeof import('./focused-coverage-owner-tests.mjs')>(
    './focused-coverage-owner-tests.mjs',
    import.meta.url
  );
}

it('resolves a rollout file to adjacent owner tests for local coverage', async () => {
  const root = createTempRoot('focused-coverage-adjacent-');
  writeFile(
    root,
    'apps/extension/src/composition/persistence/page-style/storage/index.ts',
    'export const value = 1;\n'
  );
  writeFile(
    root,
    'apps/extension/src/composition/persistence/page-style/storage/index.test.ts',
    'export const test = 1;\n'
  );

  const scope = await withCwd(root, async () => {
    const module = await importResolver();
    return module.resolveFocusedCoverageOwnerScope({
      codeFiles: ['apps/extension/src/composition/persistence/page-style/storage/index.ts'],
      mappingOptions: { mappings: [] },
    });
  });

  expect(scope).toMatchObject({
    coverageTargetFiles: ['apps/extension/src/composition/persistence/page-style/storage/index.ts'],
    testFiles: ['apps/extension/src/composition/persistence/page-style/storage/index.test.ts'],
    verdict: 'run-local-coverage',
  });
});

it('resolves explicit mapped owner tests for non-adjacent rollout files', async () => {
  const root = createTempRoot('focused-coverage-mapped-');
  writeFile(
    root,
    'apps/extension/src/composition/persistence/page-style/storage/index.ts',
    'export const value = 1;\n'
  );
  writeFile(
    root,
    'apps/extension/src/composition/persistence/page-style/storage/controller.test.ts',
    'export const test = 1;\n'
  );

  const scope = await withCwd(root, async () => {
    const module = await importResolver();
    return module.resolveFocusedCoverageOwnerScope({
      codeFiles: ['apps/extension/src/composition/persistence/page-style/storage/index.ts'],
      mappingOptions: {
        mappings: [
          {
            owner: 'page-style',
            productionFile:
              'apps/extension/src/composition/persistence/page-style/storage/index.ts',
            reason: 'controller test owns the facade behavior',
            testFiles: [
              'apps/extension/src/composition/persistence/page-style/storage/controller.test.ts',
            ],
          },
        ],
      },
    });
  });

  expect(scope).toMatchObject({
    coverageTargetFiles: ['apps/extension/src/composition/persistence/page-style/storage/index.ts'],
    testFiles: ['apps/extension/src/composition/persistence/page-style/storage/controller.test.ts'],
    verdict: 'run-local-coverage',
  });
});

it('does not select a mapped owner test that no longer exists', async () => {
  const root = createTempRoot('focused-coverage-mapped-missing-test-');
  const productionFile = 'apps/extension/src/composition/persistence/page-style/storage/index.ts';
  writeFile(root, productionFile, 'export const value = 1;\n');

  const ownerTests = await withCwd(root, async () => {
    const module = await importOwnerTests();
    return module.resolveDeterministicFocusedCoverageOwnerTests(productionFile, {
      mappings: [
        {
          owner: 'page-style',
          productionFile,
          reason: 'missing mapped test must not authorize direct proof',
          testFiles: [
            'apps/extension/src/composition/persistence/page-style/storage/missing.test.ts',
          ],
        },
      ],
    });
  });

  expect(ownerTests).toEqual([]);
});

it('uses explicit mapped owner tests instead of broad same-directory discovery', async () => {
  const root = createTempRoot('focused-coverage-mapped-narrow-');
  writeFile(
    root,
    'apps/extension/src/composition/persistence/page-style/storage/index.ts',
    'export const value = 1;\n'
  );
  writeFile(
    root,
    'apps/extension/src/composition/persistence/page-style/storage/controller.test.ts',
    'export const test = 1;\n'
  );
  writeFile(
    root,
    'apps/extension/src/composition/persistence/page-style/storage/noisy-adjacent.test.ts',
    'export const test = 1;\n'
  );

  const scope = await withCwd(root, async () => {
    const module = await importResolver();
    return module.resolveFocusedCoverageOwnerScope({
      codeFiles: ['apps/extension/src/composition/persistence/page-style/storage/index.ts'],
      mappingOptions: {
        mappings: [
          {
            owner: 'page-style',
            productionFile:
              'apps/extension/src/composition/persistence/page-style/storage/index.ts',
            reason: 'controller test owns the facade behavior',
            testFiles: [
              'apps/extension/src/composition/persistence/page-style/storage/controller.test.ts',
            ],
          },
        ],
      },
    });
  });

  expect(scope).toMatchObject({
    testFiles: ['apps/extension/src/composition/persistence/page-style/storage/controller.test.ts'],
    verdict: 'run-local-coverage',
  });
});

it('keeps an exact adjacent owner test alongside a broader prefix mapping', async () => {
  const root = createTempRoot('focused-coverage-mapped-adjacent-');
  const productionFile = 'packages/platform/src/browser/clipboard.ts';
  const adjacentTest = 'packages/platform/src/browser/clipboard.test.ts';
  const mappedTest = 'packages/platform/src/browser/runtime.test.ts';
  writeFile(root, productionFile, 'export const value = 1;\n');
  writeFile(root, adjacentTest, 'export const adjacent = 1;\n');
  writeFile(root, mappedTest, 'export const mapped = 1;\n');

  const scope = await withCwd(root, async () => {
    const module = await importResolver();
    return module.resolveFocusedCoverageOwnerScope({
      codeFiles: [productionFile],
      mappingOptions: {
        mappings: [
          {
            owner: 'browser-platform',
            productionPrefix: 'packages/platform/src/browser/',
            reason: 'the prefix mapping retains broad browser-platform integration proof',
            testFiles: [mappedTest],
          },
        ],
      },
    });
  });

  expect(scope).toMatchObject({
    testFiles: [adjacentTest, mappedTest],
    verdict: 'run-local-coverage',
  });
});

it('keeps file-specific mappings in the explicit mapping layer', async () => {
  const root = createTempRoot('focused-coverage-file-specific-');
  writeFile(root, 'apps/extension/src/contracts/messaging/contracts/runtime/actions/export.ts', '');
  writeFile(
    root,
    'apps/extension/src/contracts/messaging/contracts/runtime/actions/export.test.ts',
    ''
  );

  const scope = await withCwd(root, async () => {
    const module = await importResolver();
    return module.resolveFocusedCoverageOwnerScope({
      codeFiles: ['apps/extension/src/contracts/messaging/contracts/runtime/actions/export.ts'],
      mappingOptions: {
        mappings: [
          {
            owner: 'runtime-action-export-contracts',
            productionFile:
              'apps/extension/src/contracts/messaging/contracts/runtime/actions/export.ts',
            reason: 'export contracts own only export runtime action messages',
            testFiles: [
              'apps/extension/src/contracts/messaging/contracts/runtime/actions/export.test.ts',
            ],
          },
        ],
      },
    });
  });

  expect(scope).toMatchObject({
    testFiles: ['apps/extension/src/contracts/messaging/contracts/runtime/actions/export.test.ts'],
    verdict: 'run-local-coverage',
  });
});

it('blocks a new coverage-eligible production file without a local owner', async () => {
  const root = createTempRoot('focused-coverage-new-block-');
  writeFile(
    root,
    'apps/extension/src/content/selection/callout/new-surface.tsx',
    'export const value = 1;\n'
  );

  const scope = await withCwd(root, async () => {
    const module = await importResolver();
    return module.resolveFocusedCoverageOwnerScope({
      codeFiles: ['apps/extension/src/content/selection/callout/new-surface.tsx'],
      newFiles: ['apps/extension/src/content/selection/callout/new-surface.tsx'],
    });
  });

  expect(scope).toMatchObject({
    detail: expect.stringContaining('new files without local test owner'),
    verdict: 'block-new-file-no-owner',
  });
});

it('defers existing outside-registry files instead of failing', async () => {
  const root = createTempRoot('focused-coverage-existing-outside-');
  writeFile(
    root,
    'apps/extension/src/content/selection/callout/view.tsx',
    'export const value = 1;\n'
  );

  const scope = await withCwd(root, async () => {
    const module = await importResolver();
    return module.resolveFocusedCoverageOwnerScope({
      codeFiles: ['apps/extension/src/content/selection/callout/view.tsx'],
    });
  });

  expect(scope).toMatchObject({
    detail: expect.stringContaining('outside-registry files'),
    verdict: 'defer-ambiguous-existing',
  });
});
