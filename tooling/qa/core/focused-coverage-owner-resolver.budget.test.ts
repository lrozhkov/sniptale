import { expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd, writeFile } from './test-helpers';

async function importResolver() {
  return importFresh<typeof import('./focused-coverage-owner-resolver.mjs')>(
    './focused-coverage-owner-resolver.mjs',
    import.meta.url
  );
}

it('defers when explicit local owner tests exceed the fast-gate budget', async () => {
  const root = createTempRoot('focused-coverage-budget-');
  const productionFile = 'apps/extension/src/composition/persistence/page-style/storage/index.ts';
  writeFile(root, productionFile, 'export const value = 1;\n');
  const testFiles = Array.from(
    { length: 261 },
    (_, index) =>
      `apps/extension/src/composition/persistence/page-style/storage/owner-${index}.test.ts`
  );
  for (const testFile of testFiles) {
    writeFile(root, testFile, 'export const test = 1;\n');
  }

  const scope = await withCwd(root, async () => {
    const module = await importResolver();
    return module.resolveFocusedCoverageOwnerScope({
      codeFiles: [productionFile],
      mappingOptions: { mappings: [] },
    });
  });

  expect(scope).toMatchObject({
    detail: expect.stringContaining('local owner test expansion exceeds budget'),
    verdict: 'defer-ambiguous-existing',
  });
});

it('runs every changed direct test without treating direct proof as owner expansion', async () => {
  const root = createTempRoot('focused-coverage-direct-tests-');
  const productionFile = 'apps/extension/src/composition/persistence/page-style/storage/index.ts';
  const ownerTest = 'apps/extension/src/composition/persistence/page-style/storage/index.test.ts';
  writeFile(root, productionFile, 'export const value = 1;\n');
  writeFile(root, ownerTest, 'export const test = 1;\n');
  const directTestFiles = Array.from(
    { length: 261 },
    (_, index) => `apps/extension/src/content/direct-${index}.test.ts`
  );

  const scope = await withCwd(root, async () => {
    const module = await importResolver();
    return module.resolveFocusedCoverageOwnerScope({
      codeFiles: [productionFile],
      directTestFiles,
      mappingOptions: { mappings: [] },
    });
  });

  expect(scope).toMatchObject({
    counts: { coverageTargets: 1, ownerTests: 1, tests: 262 },
    verdict: 'run-local-coverage',
  });
});

it('allows owner expansion proportional to an already broad changed-test proof', async () => {
  const root = createTempRoot('focused-coverage-proportional-budget-');
  const productionFile = 'apps/extension/src/composition/persistence/page-style/storage/index.ts';
  writeFile(root, productionFile, 'export const value = 1;\n');
  const ownerTests = Array.from(
    { length: 261 },
    (_, index) =>
      `apps/extension/src/composition/persistence/page-style/storage/owner-${index}.test.ts`
  );
  for (const testFile of ownerTests) {
    writeFile(root, testFile, 'export const test = 1;\n');
  }
  const directTestFiles = Array.from(
    { length: 261 },
    (_, index) => `apps/extension/src/content/direct-${index}.test.ts`
  );

  const scope = await withCwd(root, async () => {
    const module = await importResolver();
    return module.resolveFocusedCoverageOwnerScope({
      codeFiles: [productionFile],
      directTestFiles,
      mappingOptions: { mappings: [] },
    });
  });

  expect(scope).toMatchObject({
    counts: { coverageTargets: 1, ownerTests: 261, tests: 522 },
    verdict: 'run-local-coverage',
  });
});

it('does not defer when a broad owner set is already entirely direct changed proof', async () => {
  const root = createTempRoot('focused-coverage-direct-owner-tests-');
  const productionFile = 'apps/extension/src/composition/persistence/page-style/storage/index.ts';
  writeFile(root, productionFile, 'export const value = 1;\n');
  const ownerTests = Array.from(
    { length: 261 },
    (_, index) =>
      `apps/extension/src/composition/persistence/page-style/storage/owner-${index}.test.ts`
  );
  for (const testFile of ownerTests) {
    writeFile(root, testFile, 'export const test = 1;\n');
  }

  const scope = await withCwd(root, async () => {
    const module = await importResolver();
    return module.resolveFocusedCoverageOwnerScope({
      codeFiles: [productionFile],
      directTestFiles: ownerTests,
      mappingOptions: { mappings: [] },
    });
  });

  expect(scope).toMatchObject({
    counts: { coverageTargets: 1, ownerTests: 261, tests: 261 },
    verdict: 'run-local-coverage',
  });
});
