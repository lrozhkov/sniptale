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

function prepareCrossOwnerAggregate(root: string) {
  const facade = 'apps/extension/src/shared/facade.ts';
  const provider = 'apps/extension/src/shared/provider.ts';
  const contentOwner = 'apps/extension/src/content/overlay/example/controller.ts';
  const popupOwner = 'apps/extension/src/popup/shell/example/controller.ts';
  initGitRepo(root);
  writeFile(root, provider, 'export const value = 1;\n');
  writeFile(root, provider.replace(/\.ts$/u, '.test.ts'), "it('covers provider', () => {});\n");
  writeFile(root, facade, "export { value } from './provider';\n");
  writeFile(
    root,
    contentOwner,
    "import { value } from '../../../shared/facade';\nexport const content = value;\n"
  );
  writeFile(
    root,
    popupOwner,
    "import { value } from '../../../shared/facade';\nexport const popup = value;\n"
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', facade);
  return { contentOwner, facade, popupOwner, provider };
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

it('maps a deleted cross-owner re-export aggregate to its surviving provider', async () => {
  const root = createTempRoot('build-deleted-cross-owner-aggregate-');
  const { contentOwner, facade, popupOwner, provider } = prepareCrossOwnerAggregate(root);
  writeFile(
    root,
    contentOwner,
    "import { value } from '../../../shared/provider';\nexport const content = value;\n"
  );
  writeFile(
    root,
    popupOwner,
    "import { value } from '../../../shared/provider';\nexport const popup = value;\n"
  );

  const successors = await collectSuccessors(
    root,
    [facade, contentOwner, popupOwner],
    [contentOwner, popupOwner]
  );

  expect(successors.get(facade)).toEqual({
    files: [provider],
    proofKind: 'aggregate-providers',
  });
});

it('rejects provider proof when changed consumers do not redirect to the provider', async () => {
  const root = createTempRoot('build-deleted-unrelated-cross-owner-aggregate-');
  const { contentOwner, facade, popupOwner } = prepareCrossOwnerAggregate(root);
  writeFile(root, contentOwner, 'export const content = 2;\n');
  writeFile(root, popupOwner, 'export const popup = 2;\n');

  const successors = await collectSuccessors(
    root,
    [facade, contentOwner, popupOwner],
    [contentOwner, popupOwner]
  );

  expect(successors.has(facade)).toBe(false);
});

it('closes a deleted re-export and pass-through chain onto its narrow provider', async () => {
  const root = createTempRoot('build-deleted-provider-chain-');
  const ownerRoot = 'apps/extension/src/content/parser/example';
  const facade = `${ownerRoot}/response.ts`;
  const adapter = `${ownerRoot}/response-json.ts`;
  const provider = `${ownerRoot}/edit-response.ts`;
  initGitRepo(root);
  writeFile(root, provider, 'export const parse = () => 1;\n');
  writeFile(root, provider.replace(/\.ts$/u, '.test.ts'), "it('covers provider', () => {});\n");
  writeFile(
    root,
    adapter,
    "import { parse } from './edit-response';\nexport function parseJson() { return parse(); }\n"
  );
  writeFile(root, facade, "export { parseJson } from './response-json';\n");
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', facade, adapter);

  const successors = await collectSuccessors(root, [facade, adapter], []);

  expect(successors.get(facade)).toEqual({
    files: [provider],
    proofKind: 'aggregate-providers',
  });
  expect(successors.get(adapter)).toEqual({
    files: [provider],
    proofKind: 'aggregate-providers',
  });
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

it('does not bypass an unchanged consumer through aggregate provider proof', async () => {
  const root = createTempRoot('build-deleted-aggregate-unchanged-importer-');
  const facade = 'apps/extension/src/shared/facade.ts';
  const provider = 'apps/extension/src/shared/provider.ts';
  const changedOwner = 'apps/extension/src/content/overlay/example/controller.ts';
  const unchangedOwner = 'apps/extension/src/popup/shell/example/controller.ts';
  initGitRepo(root);
  writeFile(root, provider, 'export const value = 1;\n');
  writeFile(root, provider.replace(/\.ts$/u, '.test.ts'), "it('covers provider', () => {});\n");
  writeFile(root, facade, "export { value } from './provider';\n");
  writeFile(
    root,
    changedOwner,
    "import { value } from '../../../shared/facade';\nexport const content = value;\n"
  );
  writeFile(
    root,
    unchangedOwner,
    "import { value } from '../../../shared/facade';\nexport const popup = value;\n"
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', facade);
  writeFile(
    root,
    changedOwner,
    "import { value } from '../../../shared/provider';\nexport const content = value;\n"
  );

  const successors = await collectSuccessors(root, [facade, changedOwner], [changedOwner]);

  expect(successors.has(facade)).toBe(false);
});

it('keeps full-suite proof when HEAD consumer discovery is incomplete', async () => {
  const root = createTempRoot('build-deleted-incomplete-discovery-');
  const facade = 'apps/extension/src/shared/facade.ts';
  const provider = 'apps/extension/src/shared/provider.ts';
  const providerTest = 'apps/extension/src/shared/provider.test.ts';
  const unchangedOwner = 'apps/extension/src/content/overlay/example/controller.ts';
  initGitRepo(root);
  writeFile(root, provider, 'export const value = 1;\n');
  writeFile(root, providerTest, "it('covers provider', () => {});\n");
  writeFile(root, facade, "export { value } from './provider';\n");
  writeFile(
    root,
    unchangedOwner,
    "import { value } from '../../../shared/facade';\nexport const content = value;\n"
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', facade);

  const result = await withCwd(root, async () => {
    const closureModule = await importFresh<typeof import('./verify-build.deleted-closure.mjs')>(
      './verify-build.deleted-closure.mjs',
      import.meta.url
    );
    const scopeModule = await importFresh<typeof import('./verify-build.scope.mjs')>(
      './verify-build.scope.mjs',
      import.meta.url
    );
    const successors = closureModule.collectDeletedTargetSuccessors({
      headImporterResolver: () => ({ complete: false, importers: [] }),
      productionTargetFiles: [facade],
      productionCodeFiles: [],
    });
    const scope = scopeModule.resolveBuildTestScope({
      targetFiles: [facade],
      codeFiles: [],
      repoCodeFiles: [provider, providerTest, unchangedOwner],
      deletedSuccessorResolver: () => successors,
      ownerTestResolver: (file) => (file === provider ? [providerTest] : []),
    });
    return { scope, successors };
  });

  expect(result.successors.has(facade)).toBe(false);
  expect(result.scope.fullSuite).toBe(true);
  expect(result.scope.detail).toContain('full product test suite');
});
