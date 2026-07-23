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
