import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from '../../../test-support/test-helpers';

async function collectSuccessors(
  root: string,
  productionTargetFiles: string[],
  productionCodeFiles: string[]
) {
  return withCwd(root, async () => {
    const module = await importFresh<typeof import('./deleted-closure.mjs')>(
      './deleted-closure.mjs',
      import.meta.url
    );
    return module.collectDeletedTargetSuccessors({
      productionTargetFiles,
      productionCodeFiles,
    });
  });
}

it('finds unchanged package consumers of a deleted package root index', async () => {
  const root = createTempRoot('build-deleted-package-index-');
  const deleted = 'packages/example/src/index.ts';
  const packageOwner = 'packages/example/src/controller.ts';
  const unchangedConsumer = 'apps/extension/src/content/overlay/example/use-package.ts';
  initGitRepo(root);
  writeFile(
    root,
    'packages/example/package.json',
    '{"name":"@sniptale/example","exports":{".":"./src/index.ts"}}\n'
  );
  writeFile(root, deleted, 'export const value = 1;\n');
  writeFile(root, packageOwner, "import './index';\nexport const controller = 1;\n");
  writeFile(
    root,
    unchangedConsumer,
    "import { value } from '@sniptale/example';\nexport const consumer = value;\n"
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', deleted);
  writeFile(root, packageOwner, 'export const controller = 2;\n');

  const successors = await collectSuccessors(root, [deleted, packageOwner], [packageOwner]);

  expect(successors.has(deleted)).toBe(false);
});

it('finds unchanged consumers when a package export alias differs from the target basename', async () => {
  const root = createTempRoot('build-deleted-package-alias-');
  const deleted = 'packages/example/src/data/state-manager/manager.ts';
  const packageOwner = 'packages/example/src/data/state-manager/controller.ts';
  const unchangedConsumer = 'apps/extension/src/content/overlay/example/use-state.ts';
  initGitRepo(root);
  writeFile(
    root,
    'packages/example/package.json',
    '{"name":"@sniptale/example","exports":{"./data/state-manager":"./src/data/state-manager/manager.ts"}}\n'
  );
  writeFile(root, deleted, 'export const value = 1;\n');
  writeFile(root, packageOwner, "import './manager';\nexport const controller = 1;\n");
  writeFile(
    root,
    unchangedConsumer,
    "import { value } from '@sniptale/example/data/state-manager';\nexport const consumer = value;\n"
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', deleted);
  writeFile(root, packageOwner, 'export const controller = 2;\n');

  const successors = await collectSuccessors(root, [deleted, packageOwner], [packageOwner]);

  expect(successors.has(deleted)).toBe(false);
});
