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

it('uses a full product fallback for a deleted owner without executable tests', () => {
  const scope = resolveBuildTestScope({
    targetFiles: ['apps/extension/src/popup/shell/app/deleted-leaf.tsx'],
    codeFiles: [],
    repoCodeFiles: [],
    ownerTestResolver: () => [],
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.fullSuite).toBe(true);
  expect(scope.directTestFiles).toEqual([]);
  expect(scope.relatedFiles).toEqual([]);
  expect(scope.detail).toContain('full product test suite');
});

it('does not accept a test keyed only to a deleted path without a surviving graph owner', () => {
  const ownerTest = 'apps/extension/src/popup/shell/app/deleted-leaf.test.tsx';
  const scope = resolveBuildTestScope({
    targetFiles: ['apps/extension/src/popup/shell/app/deleted-leaf.tsx'],
    codeFiles: [],
    repoCodeFiles: [ownerTest],
    ownerTestResolver: () => [ownerTest],
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.fullSuite).toBe(true);
  expect(scope.directTestFiles).toEqual([]);
  expect(scope.relatedFiles).toEqual([]);
});

it('forces the full suite when one target in a mixed production diff is deleted and uncovered', () => {
  const existingFile = 'apps/extension/src/popup/shell/app/view.tsx';
  const deletedFile = 'apps/extension/src/gallery/unmapped-deleted-leaf.tsx';
  const scope = resolveBuildTestScope({
    targetFiles: [existingFile, deletedFile],
    codeFiles: [existingFile],
    repoCodeFiles: [existingFile],
    ownerTestResolver: (file) =>
      file === existingFile ? ['apps/extension/src/popup/shell/app/view.test.tsx'] : [],
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.fullSuite).toBe(true);
  expect(scope.directTestFiles).toEqual([]);
  expect(scope.relatedFiles).toEqual([]);
});

it('does not let an unrelated changed test authorize deletion proof', () => {
  const changedTest = 'apps/extension/src/ui/keyboard/editable-target.test.ts';
  const scope = resolveBuildTestScope({
    targetFiles: ['apps/extension/src/gallery/unmapped-deleted-leaf.tsx', changedTest],
    codeFiles: [changedTest],
    repoCodeFiles: [changedTest],
    ownerTestResolver: () => [],
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.fullSuite).toBe(true);
  expect(scope.directTestFiles).toEqual([]);
  expect(scope.relatedFiles).toEqual([]);
});

it.each([
  'controller/index.test-support.ts',
  'controller/test-support.ts',
  'controller/test-support/session.ts',
  'controller/fixtures.ts',
  'controller/fixtures/session.ts',
  'controller/index.test.helpers.ts',
  'controller/index.test.fixtures.ts',
])('does not treat deleted proof file %s as unavailable production code', (proofPath) => {
  const owner = 'apps/extension/src/content/selection/selection-mode/controller/index.ts';
  const ownerTest = 'apps/extension/src/content/selection/selection-mode/controller/index.test.ts';
  const deletedSupport = `apps/extension/src/content/selection/selection-mode/${proofPath}`;
  const scope = resolveBuildTestScope({
    targetFiles: [deletedSupport, owner, ownerTest],
    codeFiles: [owner, ownerTest],
    repoCodeFiles: [owner, ownerTest],
    ownerTestResolver: (file) => (file === owner ? [ownerTest] : []),
  });

  expect(scope.fullSuite).not.toBe(true);
  expect(scope.directTestFiles).toEqual([ownerTest]);
  expect(scope.detail).not.toContain('unavailable production target');
});

it('does not infer storage risk from the handbook name', () => {
  const scope = resolveBuildTestScope({
    targetFiles: ['docs/tooling/operator-handbook.md'],
    codeFiles: [],
    repoCodeFiles: [],
  });

  expect(scope.matchedFamilies).not.toContain('storage-persistence');
});

it('uses a changed replacement owner and its direct test for a consolidated deleted subtree', () => {
  const owner = 'apps/extension/src/content/selection/selection-mode/session/index.ts';
  const ownerTest = 'apps/extension/src/content/selection/selection-mode/session/index.test.ts';
  const deleted =
    'apps/extension/src/content/selection/selection-mode/session/runtime-state/core.ts';
  const scope = resolveBuildTestScope({
    targetFiles: [deleted, owner, ownerTest],
    codeFiles: [owner, ownerTest],
    repoCodeFiles: [owner, ownerTest],
    ownerTestResolver: (file) => (file === owner ? [ownerTest] : []),
    deletedSuccessorResolver: () => new Map([[deleted, [owner]]]),
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.fullSuite).not.toBe(true);
  expect(scope.relatedFiles).toEqual([ownerTest, owner]);
  expect(scope.detail).toContain('graph-closed successor owner proof');
});

it('requires deterministic owner proof for every aggregate provider', () => {
  const deleted = 'apps/extension/src/content/parser/example/facade.ts';
  const covered = 'apps/extension/src/content/parser/example/covered.ts';
  const untested = 'apps/extension/src/content/parser/example/untested.ts';
  const scope = resolveBuildTestScope({
    targetFiles: [deleted],
    codeFiles: [],
    repoCodeFiles: [covered, untested],
    ownerTestResolver: (file) =>
      file === covered ? ['apps/extension/src/content/parser/example/covered.test.ts'] : [],
    deletedSuccessorResolver: () =>
      new Map([
        [
          deleted,
          {
            files: [covered, untested],
            proofKind: 'aggregate-providers',
          },
        ],
      ]),
  });

  expect(scope.fullSuite).toBe(true);
  expect(scope.detail).toContain('unavailable production target has no executable affected-test');
});

it('does not accept an unrelated same-directory test as replacement-owner proof', () => {
  const owner = 'apps/extension/src/content/selection/selection-mode/session/index.ts';
  const unrelatedTest =
    'apps/extension/src/content/selection/selection-mode/session/unrelated.test.ts';
  const deleted =
    'apps/extension/src/content/selection/selection-mode/session/runtime-state/core.ts';
  const scope = resolveBuildTestScope({
    targetFiles: [deleted, owner, unrelatedTest],
    codeFiles: [owner, unrelatedTest],
    repoCodeFiles: [owner, unrelatedTest],
    ownerTestResolver: () => [],
  });

  expect(scope.fullSuite).toBe(true);
  expect(scope.directTestFiles).toEqual([]);
});

it('does not accept a deleted adjacent test as replacement-owner proof', () => {
  const owner = 'apps/extension/src/content/selection/selection-mode/session/index.ts';
  const deletedOwnerTest =
    'apps/extension/src/content/selection/selection-mode/session/index.test.ts';
  const deleted =
    'apps/extension/src/content/selection/selection-mode/session/runtime-state/core.ts';
  const scope = resolveBuildTestScope({
    targetFiles: [deleted, owner, deletedOwnerTest],
    codeFiles: [owner],
    repoCodeFiles: [owner],
    ownerTestResolver: () => [],
  });

  expect(scope.fullSuite).toBe(true);
  expect(scope.directTestFiles).toEqual([]);
});

it('maps a deleted modal facade chain to bounded surviving owner proof', async () => {
  const root = createTempRoot('build-deleted-modal-chain-');
  const ownerRoot = 'apps/extension/src/content/overlay/ai/modal/session';
  const deletedFiles = [
    'action-builders.ts',
    'action-props.ts',
    'actions.ts',
    'boot-props.ts',
    'build.ts',
    'core.ts',
    'prompt-template-state.ts',
    'view-props.ts',
  ].map((file) => `${ownerRoot}/${file}`);
  const survivingFiles = [
    'boot.ts',
    'controller.ts',
    'core-state.ts',
    'index.ts',
    'open.ts',
    'view-state.ts',
  ].map((file) => `${ownerRoot}/${file}`);
  const ownerTests = [
    'boot.test.ts',
    'controller.test.ts',
    'core-state.test.ts',
    'open.test.ts',
    'view-state.test.ts',
  ].map((file) => `${ownerRoot}/${file}`);
  const previousSources = new Map([
    [`${ownerRoot}/action-builders.ts`, 'export const actions = {};\n'],
    [`${ownerRoot}/action-props.ts`, "import './actions';\nimport './build';\n"],
    [`${ownerRoot}/actions.ts`, 'export const createAction = () => null;\n'],
    [`${ownerRoot}/boot-props.ts`, 'export type BootProps = {};\n'],
    [`${ownerRoot}/build.ts`, "import './action-builders';\nexport const build = () => null;\n"],
    [`${ownerRoot}/core.ts`, "import './controller';\nimport './core-state';\n"],
    [`${ownerRoot}/prompt-template-state.ts`, 'export const templates = [];\n'],
    [`${ownerRoot}/view-props.ts`, 'export const viewProps = {};\n'],
    [`${ownerRoot}/boot.ts`, "import './boot-props';\nexport const boot = () => null;\n"],
    [
      `${ownerRoot}/controller.ts`,
      "import './action-props';\nimport './boot-props';\nimport './build';\nimport './view-props';\n",
    ],
    [`${ownerRoot}/core-state.ts`, "import './prompt-template-state';\nexport const state = {};\n"],
    [`${ownerRoot}/index.ts`, "import './core';\nexport const modal = {};\n"],
    [`${ownerRoot}/open.ts`, "import './boot-props';\nexport const open = () => null;\n"],
    [`${ownerRoot}/view-state.ts`, "import './prompt-template-state';\nexport const view = {};\n"],
  ]);

  initGitRepo(root);
  for (const [file, source] of previousSources) writeFile(root, file, source);
  for (const testFile of ownerTests) writeFile(root, testFile, "it('covers owner', () => {});\n");
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  runGit(root, 'rm', ...deletedFiles);

  const currentSources = new Map([
    [`${ownerRoot}/index.ts`, "import './controller';\nexport const modal = {};\n"],
    [
      `${ownerRoot}/controller.ts`,
      "import './boot';\nimport './core-state';\nimport './view-state';\nexport const controller = {};\n",
    ],
    [`${ownerRoot}/boot.ts`, "import './open';\nexport const boot = () => null;\n"],
    [`${ownerRoot}/open.ts`, 'export const open = () => null;\n'],
    [`${ownerRoot}/core-state.ts`, 'export const state = {};\n'],
    [`${ownerRoot}/view-state.ts`, 'export const view = {};\n'],
  ]);
  for (const [file, source] of currentSources) writeFile(root, file, source);
  writeFile(
    root,
    `${ownerRoot}/controller.test.ts`,
    "it('covers consolidated owner', () => {});\n"
  );

  const changedTest = `${ownerRoot}/controller.test.ts`;
  const targetFiles = [...deletedFiles, ...survivingFiles, changedTest];
  const codeFiles = [...survivingFiles, changedTest];
  const repoCodeFiles = [...survivingFiles, ...ownerTests];
  const ownerTestByFile = new Map(
    survivingFiles.map((file) => {
      const candidate = file.replace(/\.ts$/u, '.test.ts');
      return [file, ownerTests.includes(candidate) ? [candidate] : []];
    })
  );
  const ownerTestResolver = (file) => ownerTestByFile.get(file) ?? [];

  const result = await withCwd(root, async () => {
    const scopeModule = await importFresh<typeof import('./verify-build.scope.mjs')>(
      './verify-build.scope.mjs',
      import.meta.url
    );
    const preflightModule = await importFresh<typeof import('./guardrail-preflight-scope.mjs')>(
      './guardrail-preflight-scope.mjs',
      import.meta.url
    );
    const scope = scopeModule.resolveBuildTestScope({
      targetFiles,
      codeFiles,
      repoCodeFiles,
      ownerTestResolver,
    });
    const forecast = preflightModule.collectBuildScopeForecast({ targetFiles, codeFiles });
    return { forecast, scope };
  });

  expect(result.scope.fullSuite).not.toBe(true);
  expect(result.scope.relatedFiles).toHaveLength(11);
  expect(result.forecast.details[0]).toContain('selected unit-test scope=11');
  expect(result.forecast.details[0]).not.toContain('full product test suite');
});

it('keeps shared feature privacy entrypoints on the related profile', () => {
  const sourceFile = 'apps/extension/src/features/ai/privacy/index.ts';
  const scope = resolveBuildTestScope({
    targetFiles: [sourceFile],
    codeFiles: [sourceFile],
    repoCodeFiles: [sourceFile],
    focusedScopeResolver: () => ({
      detail: 'local owner tests=1; coverageTargets=1',
      testFiles: ['apps/extension/src/features/ai/privacy/index.test.ts'],
      verdict: 'run-local-coverage',
    }),
    ownerTestResolver: () => ['apps/extension/src/features/ai/privacy/index.test.ts'],
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.relatedFiles).toEqual([sourceFile]);
});

it('keeps destructive settings privacy owners on the related profile', () => {
  const sourceFile = 'apps/extension/src/settings/sections/privacy/index.tsx';
  const scope = resolveBuildTestScope({
    targetFiles: [sourceFile],
    codeFiles: [sourceFile],
    repoCodeFiles: [sourceFile],
    focusedScopeResolver: () => ({
      detail: 'local owner tests=2; coverageTargets=1',
      testFiles: [
        'apps/extension/src/settings/sections/privacy/index.test.tsx',
        'apps/extension/src/settings/shell/page/sections.test.tsx',
      ],
      verdict: 'run-local-coverage',
    }),
    ownerTestResolver: () => [
      'apps/extension/src/settings/sections/privacy/index.test.tsx',
      'apps/extension/src/settings/shell/page/sections.test.tsx',
    ],
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.relatedFiles).toEqual([sourceFile]);
});

it('keeps canonical project export owners on the related profile', () => {
  const sourceFile = 'apps/extension/src/scenario-editor/project/export/images.ts';
  const siblingFile = 'apps/extension/src/scenario-editor/project/export/index.ts';
  const scope = resolveBuildTestScope({
    targetFiles: [sourceFile],
    codeFiles: [sourceFile],
    repoCodeFiles: [sourceFile, siblingFile],
    focusedScopeResolver: () => ({
      detail: 'local owner tests=1; coverageTargets=1',
      testFiles: ['apps/extension/src/scenario-editor/project/export/images.test.ts'],
      verdict: 'run-local-coverage',
    }),
    ownerTestResolver: () => ['apps/extension/src/scenario-editor/project/export/images.test.ts'],
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.matchedFamilies).toContain('parser-snapshot-export');
  expect(scope.relatedFiles).toEqual([sourceFile, siblingFile]);
});

it('keeps shared UI entrypoints on the related profile while leaf helpers stay direct', () => {
  const sourceFile = 'apps/extension/src/ui/command-palette/index.tsx';
  const scope = resolveBuildTestScope({
    targetFiles: [sourceFile],
    codeFiles: [sourceFile],
    repoCodeFiles: [sourceFile],
    focusedScopeResolver: () => ({
      detail: 'local owner tests=1; coverageTargets=1',
      testFiles: ['apps/extension/src/ui/command-palette/index.test.tsx'],
      verdict: 'run-local-coverage',
    }),
    ownerTestResolver: () => ['apps/extension/src/ui/command-palette/index.test.tsx'],
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.relatedFiles).toEqual([sourceFile]);
});

it('keeps an ordinary UI leaf on owner-direct when its exact owner proof is complete', () => {
  const sourceFile = 'apps/extension/src/ui/command-palette/helpers.ts';
  const testFile = 'apps/extension/src/ui/command-palette/helpers.test.ts';
  const scope = resolveBuildTestScope({
    targetFiles: [sourceFile],
    codeFiles: [sourceFile],
    repoCodeFiles: [sourceFile, testFile],
    focusedScopeResolver: () => ({
      detail: 'outside-registry files without changed local tests',
      testFiles: [],
      verdict: 'defer-ambiguous-existing',
    }),
    ownerTestResolver: () => [testFile],
  });

  expect(scope.profile).toBe('owner-direct');
  expect(scope.directTestFiles).toEqual([testFile]);
});
