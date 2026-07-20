import { expect, it } from 'vitest';

import { resolveBuildTestScope } from './verify-build.scope.mjs';

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

it('uses surviving deterministic owner tests for a deleted leaf', () => {
  const ownerTest = 'apps/extension/src/popup/shell/app/deleted-leaf.test.tsx';
  const scope = resolveBuildTestScope({
    targetFiles: ['apps/extension/src/popup/shell/app/deleted-leaf.tsx'],
    codeFiles: [],
    repoCodeFiles: [ownerTest],
    ownerTestResolver: () => [ownerTest],
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.fullSuite).not.toBe(true);
  expect(scope.directTestFiles).toEqual([]);
  expect(scope.relatedFiles).toEqual([ownerTest]);
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
