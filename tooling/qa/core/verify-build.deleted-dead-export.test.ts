import { expect, it } from 'vitest';

import { resolveBuildTestScope } from './verify-build.scope.mjs';
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

it('closes a deleted facade while ignoring its proved-unused side-effect-free export', async () => {
  const root = createTempRoot('build-deleted-dead-export-');
  const ownerRoot = 'apps/extension/src/content/parser/example';
  const facade = `${ownerRoot}/index.ts`;
  const deadProvider = `${ownerRoot}/dead-result.ts`;
  const liveProvider = `${ownerRoot}/messaging.ts`;
  const contentConsumer = `${ownerRoot}/controller.ts`;
  const publicConsumer = 'apps/extension/src/content/public/example/types.ts';
  initGitRepo(root);
  writeFile(root, deadProvider, 'export function mapUnused() { return true; }\n');
  writeFile(
    root,
    `${ownerRoot}/root.test.ts`,
    "import { mapUnused } from './index';\nit('covers old facade', () => mapUnused());\n"
  );
  writeFile(root, liveProvider, 'export const send = () => true;\n');
  writeFile(
    root,
    liveProvider.replace(/\.ts$/u, '.test.ts'),
    "it('covers messaging', () => {});\n"
  );
  writeFile(
    root,
    facade,
    "export { mapUnused } from './dead-result';\nexport { send } from './messaging';\n"
  );
  writeFile(
    root,
    contentConsumer,
    "import { send } from './index';\nexport const content = send();\n"
  );
  writeFile(
    root,
    publicConsumer,
    "import type { send } from '../../parser/example';\nexport type Send = typeof send;\n"
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', facade, deadProvider, `${ownerRoot}/root.test.ts`);
  writeFile(
    root,
    contentConsumer,
    "import { send } from './messaging';\nexport const content = send();\n"
  );
  writeFile(
    root,
    publicConsumer,
    "import type { send } from '../../parser/example/messaging';\nexport type Send = typeof send;\n"
  );

  const successors = await collectSuccessors(
    root,
    [facade, deadProvider, contentConsumer, publicConsumer],
    [contentConsumer, publicConsumer]
  );

  expect(successors.get(facade)).toEqual({
    files: [liveProvider],
    proofKind: 'aggregate-providers',
  });
  expect(successors.get(deadProvider)).toEqual({ files: [], proofKind: 'dead-export' });
});

it('does not classify a deleted module with top-level effects as a dead export', async () => {
  const root = createTempRoot('build-deleted-effectful-export-');
  const deleted = 'apps/extension/src/content/parser/example/registration.ts';
  initGitRepo(root);
  writeFile(
    root,
    deleted,
    "globalThis.addEventListener('message', () => {});\nexport function register() {}\n"
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', deleted);

  const successors = await collectSuccessors(root, [deleted], []);

  expect(successors.has(deleted)).toBe(false);
});

it('accepts dead-export closure proof without inventing an owner test', () => {
  const deleted = 'apps/extension/src/content/parser/example/dead-result.ts';
  const scope = resolveBuildTestScope({
    targetFiles: [deleted],
    codeFiles: [],
    repoCodeFiles: [],
    deletedSuccessorResolver: () => new Map([[deleted, { files: [], proofKind: 'dead-export' }]]),
  });

  expect(scope.fullSuite).not.toBe(true);
  expect(scope.profile).toBe('related-transitive');
  expect(scope.detail).toContain('graph-closed successor/dead-export proof');
});
