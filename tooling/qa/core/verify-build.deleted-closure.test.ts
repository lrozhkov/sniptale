import { expect, it, vi } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from './test-helpers';

async function collectSuccessors(
  root: string,
  productionTargetFiles: string[],
  productionCodeFiles: string[]
) {
  return withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-build.deleted-closure.mjs')>(
      './verify-build.deleted-closure.mjs',
      import.meta.url
    );
    return module.collectDeletedTargetSuccessors({
      productionTargetFiles,
      productionCodeFiles,
    });
  });
}

it('keeps ambiguous cross-owner deleted successors on the full-suite fallback', async () => {
  const root = createTempRoot('build-deleted-ambiguous-');
  const deleted = 'apps/extension/src/shared/deleted.ts';
  const contentOwner = 'apps/extension/src/content/overlay/example/controller.ts';
  const popupOwner = 'apps/extension/src/popup/shell/example/controller.ts';
  initGitRepo(root);
  writeFile(root, deleted, 'export const value = 1;\n');
  writeFile(root, contentOwner, "import '../../../shared/deleted';\nexport const content = 1;\n");
  writeFile(root, popupOwner, "import '../../../shared/deleted';\nexport const popup = 1;\n");
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', deleted);
  writeFile(root, contentOwner, 'export const content = 2;\n');
  writeFile(root, popupOwner, 'export const popup = 2;\n');

  const successors = await collectSuccessors(
    root,
    [deleted, contentOwner, popupOwner],
    [contentOwner, popupOwner]
  );

  expect(successors.has(deleted)).toBe(false);
});

it('rejects partial deleted chains with an uncovered terminal facade', async () => {
  const root = createTempRoot('build-deleted-partial-');
  const ownerRoot = 'apps/extension/src/content/overlay/example';
  const deleted = `${ownerRoot}/leaf.ts`;
  const terminalFacade = `${ownerRoot}/orphan-facade.ts`;
  const controller = `${ownerRoot}/controller.ts`;
  initGitRepo(root);
  writeFile(root, deleted, 'export const value = 1;\n');
  writeFile(root, terminalFacade, "import './leaf';\nexport const facade = 1;\n");
  writeFile(root, controller, "import './leaf';\nexport const controller = 1;\n");
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', deleted, terminalFacade);
  writeFile(root, controller, 'export const controller = 2;\n');

  const successors = await collectSuccessors(
    root,
    [deleted, terminalFacade, controller],
    [controller]
  );

  expect(successors.has(deleted)).toBe(false);
});

it('closes deleted chains through dotted TypeScript module stems', async () => {
  const root = createTempRoot('build-deleted-dotted-stem-');
  const ownerRoot = 'apps/extension/src/content/overlay/example';
  const dottedLeaf = `${ownerRoot}/events.helpers.ts`;
  const eventFacade = `${ownerRoot}/events.ts`;
  const controller = `${ownerRoot}/controller.ts`;
  initGitRepo(root);
  writeFile(root, dottedLeaf, 'export const helper = true;\n');
  writeFile(root, eventFacade, "import './events.helpers';\nexport const event = true;\n");
  writeFile(root, controller, "import './events';\nexport const controller = 1;\n");
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', dottedLeaf, eventFacade);
  writeFile(root, controller, 'export const controller = 2;\n');

  const successors = await collectSuccessors(
    root,
    [dottedLeaf, eventFacade, controller],
    [controller]
  );

  expect(successors.get(dottedLeaf)).toEqual([controller]);
  expect(successors.get(eventFacade)).toEqual([controller]);
});

it('closes converging deleted chains without treating a visited importer as uncovered', async () => {
  const root = createTempRoot('build-deleted-converging-');
  const ownerRoot = 'apps/extension/src/content/overlay/example';
  const leaf = `${ownerRoot}/leaf.ts`;
  const adapter = `${ownerRoot}/adapter.ts`;
  const facade = `${ownerRoot}/facade.ts`;
  const controller = `${ownerRoot}/controller.ts`;
  initGitRepo(root);
  writeFile(root, leaf, 'export const leaf = true;\n');
  writeFile(root, adapter, "import './leaf';\nexport const adapter = true;\n");
  writeFile(root, facade, "import './leaf';\nimport './adapter';\nexport const facade = true;\n");
  writeFile(root, controller, "import './facade';\nexport const controller = 1;\n");
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', leaf, adapter, facade);
  writeFile(root, controller, 'export const controller = 2;\n');

  const successors = await collectSuccessors(
    root,
    [leaf, adapter, facade, controller],
    [controller]
  );

  expect(successors.get(leaf)).toEqual([controller]);
  expect(successors.get(adapter)).toEqual([controller]);
  expect(successors.get(facade)).toEqual([controller]);
});

it('memoizes HEAD importer discovery across deleted roots in one closure run', async () => {
  const root = createTempRoot('build-deleted-importer-cache-');
  const ownerRoot = 'apps/extension/src/content/overlay/example';
  const leaf = `${ownerRoot}/leaf.ts`;
  const adapter = `${ownerRoot}/adapter.ts`;
  const facade = `${ownerRoot}/facade.ts`;
  const controller = `${ownerRoot}/controller.ts`;
  writeFile(root, controller, 'export const controller = 2;\n');
  const importers = new Map([
    [leaf, [adapter, facade]],
    [adapter, [facade]],
    [facade, [controller]],
  ]);
  const headImporterResolver = vi.fn((file: string) => importers.get(file) ?? []);

  const successors = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-build.deleted-closure.mjs')>(
      './verify-build.deleted-closure.mjs',
      import.meta.url
    );
    return module.collectDeletedTargetSuccessors({
      headImporterResolver,
      productionTargetFiles: [leaf, adapter, facade, controller],
      productionCodeFiles: [controller],
    });
  });

  expect(successors.get(leaf)).toEqual([controller]);
  expect(successors.get(adapter)).toEqual([controller]);
  expect(successors.get(facade)).toEqual([controller]);
  expect(headImporterResolver).toHaveBeenCalledTimes(3);
  expect(new Set(headImporterResolver.mock.calls.map(([file]) => file))).toEqual(
    new Set([leaf, adapter, facade])
  );
});

it('rejects a deleted chain when an unchanged HEAD importer remains outside the diff', async () => {
  const root = createTempRoot('build-deleted-unchanged-importer-');
  const ownerRoot = 'apps/extension/src/content/overlay/example';
  const deleted = `${ownerRoot}/leaf.ts`;
  const controller = `${ownerRoot}/controller.ts`;
  const unchangedImporter = `${ownerRoot}/orphan.ts`;
  initGitRepo(root);
  writeFile(root, deleted, 'export const value = 1;\n');
  writeFile(root, controller, "import './leaf';\nexport const controller = 1;\n");
  writeFile(root, unchangedImporter, "import './leaf';\nexport const orphan = 1;\n");
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', deleted);
  writeFile(root, controller, 'export const controller = 2;\n');

  const successors = await collectSuccessors(root, [deleted, controller], [controller]);

  expect(successors.has(deleted)).toBe(false);
});

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
