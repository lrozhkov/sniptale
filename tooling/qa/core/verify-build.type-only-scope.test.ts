import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from './test-helpers';

it('skips product unit tests for a deleted type-only contract module', async () => {
  const root = createTempRoot('build-scope-deleted-type-only-');
  const contract = 'apps/extension/src/content/selection/example/contracts.ts';
  initGitRepo(root);
  writeFile(root, contract, 'export interface SelectionContract { id: string; }\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', contract);

  const scope = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-build.scope.mjs')>(
      './verify-build.scope.mjs',
      import.meta.url
    );
    return module.resolveBuildTestScope({
      targetFiles: [contract],
      codeFiles: [],
      repoCodeFiles: [],
    });
  });

  expect(scope.profile).toBe('skip');
  expect(scope.directTestFiles).toEqual([]);
  expect(scope.relatedFiles).toEqual([]);
});

it('uses an import-only changed owner as direct deleted-path topology proof', async () => {
  const root = createTempRoot('build-scope-deleted-forwarder-');
  const ownerRoot = 'apps/extension/src/content/selection/example';
  const consumer = `${ownerRoot}/consumer.ts`;
  const facade = `${ownerRoot}/facade.ts`;
  const provider = `${ownerRoot}/provider.ts`;
  const providerTest = `${ownerRoot}/provider.test.ts`;
  initGitRepo(root);
  writeFile(root, provider, 'export const runtimeValue = 1;\n');
  writeFile(root, providerTest, "it('covers provider', () => {});\n");
  writeFile(root, facade, "export { runtimeValue } from './provider';\n");
  writeFile(
    root,
    consumer,
    "import { runtimeValue } from './facade';\nexport const selected = runtimeValue;\n"
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', facade);
  writeFile(
    root,
    consumer,
    "import { runtimeValue } from './provider';\nexport const selected = runtimeValue;\n"
  );

  const scope = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-build.scope.mjs')>(
      './verify-build.scope.mjs',
      import.meta.url
    );
    return module.resolveBuildTestScope({
      targetFiles: [consumer, facade],
      codeFiles: [consumer],
      repoCodeFiles: [consumer, provider, providerTest],
      ownerTestResolver: (file) => (file === consumer ? [providerTest] : []),
    });
  });

  expect(scope.profile).toBe('owner-direct');
  expect(scope.fullSuite).not.toBe(true);
  expect(scope.detail).toContain('graph-closed changed-owner proof');
  expect(scope.directTestFiles).toEqual([providerTest]);
  expect(scope.relatedFiles).toEqual([]);
});
