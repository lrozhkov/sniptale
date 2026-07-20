import { expect, it } from 'vitest';

import { BUILD_TEST_PROFILE_LIMITS, resolveBuildTestScope } from './verify-build.scope.mjs';

it('keeps owner-local diffs narrow in qa:build', () => {
  const scope = resolveBuildTestScope({
    targetFiles: ['apps/extension/src/popup/shell/app/view.tsx'],
    codeFiles: ['apps/extension/src/popup/shell/app/view.tsx'],
    repoCodeFiles: [
      'apps/extension/src/popup/shell/app/view.tsx',
      'apps/extension/src/popup/shell/app/view.test.tsx',
      'apps/extension/src/popup/shell/app/other.tsx',
      'apps/extension/src/background/runtime/index.ts',
    ],
    focusedScopeResolver: () => ({
      detail: 'local owner tests=1; coverageTargets=1',
      testFiles: ['apps/extension/src/popup/shell/app/view.test.tsx'],
      verdict: 'run-local-coverage',
    }),
    ownerTestResolver: () => ['apps/extension/src/popup/shell/app/view.test.tsx'],
  });

  expect(scope.profile).toBe('owner-direct');
  expect(scope.directTestFiles).toEqual(['apps/extension/src/popup/shell/app/view.test.tsx']);
  expect(scope.relatedFiles).toEqual([]);
  expect(scope.matchedFamilies).toEqual([]);
  expect(scope.detail).toContain('profile=owner-direct');
});

it('uses mapped direct tests for a small mixed UI owner correction', () => {
  const targetFiles = [
    'apps/extension/src/content/platform/quick-action-hotkeys/index.test.ts',
    'apps/extension/src/content/platform/quick-action-hotkeys/index.ts',
    'apps/extension/src/ui/command-palette/helpers.test.ts',
    'apps/extension/src/ui/command-palette/helpers.ts',
    'apps/extension/src/ui/command-palette/hotkey.ts',
    'apps/extension/src/ui/keyboard/editable-target.test.ts',
    'apps/extension/src/ui/keyboard/editable-target.ts',
    'docs/engineering/tech-debt-report.md',
  ];
  const changedTests = targetFiles.filter((file) => file.includes('.test.'));
  const ownerTests = [
    ...changedTests,
    'apps/extension/src/ui/command-palette/hotkey.test.tsx',
  ].sort();
  const ownerTestsByFile = new Map([
    [
      'apps/extension/src/content/platform/quick-action-hotkeys/index.ts',
      ['apps/extension/src/content/platform/quick-action-hotkeys/index.test.ts'],
    ],
    [
      'apps/extension/src/ui/command-palette/helpers.ts',
      ['apps/extension/src/ui/command-palette/helpers.test.ts'],
    ],
    [
      'apps/extension/src/ui/command-palette/hotkey.ts',
      ['apps/extension/src/ui/command-palette/hotkey.test.tsx'],
    ],
    [
      'apps/extension/src/ui/keyboard/editable-target.ts',
      ['apps/extension/src/ui/keyboard/editable-target.test.ts'],
    ],
  ]);
  const scope = resolveBuildTestScope({
    targetFiles,
    codeFiles: targetFiles.filter((file) => /\.(?:ts|tsx)$/u.test(file)),
    repoCodeFiles: targetFiles,
    focusedScopeResolver: () => ({
      detail: 'outside-registry runtime changes covered by changed direct tests',
      testFiles: changedTests,
      verdict: 'run-local-tests-no-coverage',
    }),
    ownerTestResolver: (file) => ownerTestsByFile.get(file) ?? [],
  });

  expect(scope.profile).toBe('owner-direct');
  expect(scope.directTestFiles).toEqual(ownerTests);
  expect(scope.relatedFiles).toEqual([]);
});

it('does not treat an unrelated changed test as complete owner proof', () => {
  const scope = resolveBuildTestScope({
    targetFiles: [
      'apps/extension/src/popup/shell/app/view.tsx',
      'apps/extension/src/ui/keyboard/editable-target.test.ts',
    ],
    codeFiles: [
      'apps/extension/src/popup/shell/app/view.tsx',
      'apps/extension/src/ui/keyboard/editable-target.test.ts',
    ],
    repoCodeFiles: [],
    focusedScopeResolver: () => ({
      detail: 'outside-registry runtime changes covered by changed direct tests',
      testFiles: ['apps/extension/src/ui/keyboard/editable-target.test.ts'],
      verdict: 'run-local-tests-no-coverage',
    }),
    ownerTestResolver: () => [],
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.directTestFiles).toEqual([]);
  expect(scope.relatedFiles).toEqual([
    'apps/extension/src/popup/shell/app/view.tsx',
    'apps/extension/src/ui/keyboard/editable-target.test.ts',
  ]);
});

it('expands shared public changes to the owner-local shared seam in qa:build', () => {
  const scope = resolveBuildTestScope({
    targetFiles: ['apps/extension/src/platform/runtime-messaging/index.ts'],
    codeFiles: ['apps/extension/src/platform/runtime-messaging/index.ts'],
    repoCodeFiles: [
      'apps/extension/src/platform/runtime-messaging/index.ts',
      'apps/extension/src/platform/runtime-messaging/client.ts',
      'apps/extension/src/platform/runtime-messaging/client.test.ts',
      'apps/extension/src/composition/persistence/storage/index.ts',
    ],
  });

  expect(scope.matchedFamilies).toContain('package-and-app-core');
  expect(scope.matchedFamilies).toContain('messaging-runtime');
  expect(scope.profile).toBe('related-transitive');
  expect(scope.relatedFiles).toEqual([
    'apps/extension/src/platform/runtime-messaging/client.ts',
    'apps/extension/src/platform/runtime-messaging/index.ts',
  ]);
});

it('expands parser and export seams to broader related owner files in qa:build', () => {
  const scope = resolveBuildTestScope({
    targetFiles: [
      'apps/extension/src/content/parser/dom-tree-parser/traversal/section-titles.helpers.ts',
      'apps/extension/src/offscreen/project-export/runtime.ts',
    ],
    codeFiles: [
      'apps/extension/src/content/parser/dom-tree-parser/traversal/section-titles.helpers.ts',
      'apps/extension/src/offscreen/project-export/runtime.ts',
    ],
    repoCodeFiles: [
      'apps/extension/src/content/parser/dom-tree-parser/traversal/section-titles.helpers.ts',
      'apps/extension/src/content/parser/dom-tree-parser/index.ts',
      'apps/extension/src/content/parser/dom-tree-parser/index.test.ts',
      'apps/extension/src/offscreen/project-export/runtime.ts',
      'apps/extension/src/offscreen/project-export/service/runner.ts',
      'apps/extension/src/offscreen/project-export/service/runner.test.ts',
    ],
  });

  expect(scope.matchedFamilies).toContain('parser-snapshot-export');
  expect(scope.profile).toBe('related-transitive');
  expect(scope.relatedFiles).toEqual([
    'apps/extension/src/content/parser/dom-tree-parser/index.ts',
    'apps/extension/src/content/parser/dom-tree-parser/traversal/section-titles.helpers.ts',
    'apps/extension/src/offscreen/project-export/runtime.ts',
    'apps/extension/src/offscreen/project-export/service/runner.ts',
  ]);
});

it('falls back to direct changed tests when qa:build has no changed code files', () => {
  const scope = resolveBuildTestScope({
    targetFiles: ['apps/extension/src/popup/shell/app/view.test.tsx'],
    codeFiles: ['apps/extension/src/popup/shell/app/view.test.tsx'],
    repoCodeFiles: ['apps/extension/src/popup/shell/app/view.test.tsx'],
  });

  expect(scope.directTestFiles).toEqual(['apps/extension/src/popup/shell/app/view.test.tsx']);
  expect(scope.relatedFiles).toEqual([]);
  expect(scope.profile).toBe('direct-changed');
});

it('filters harness files out of product qa:build test scope', () => {
  const scope = resolveBuildTestScope({
    targetFiles: ['tooling/qa/core/example.test.ts', 'tooling/release/package-dist.test.ts'],
    codeFiles: ['tooling/qa/core/example.test.ts', 'tooling/release/package-dist.test.ts'],
    repoCodeFiles: ['tooling/qa/core/example.test.ts', 'tooling/release/package-dist.test.ts'],
  });

  expect(scope.directTestFiles).toEqual([]);
  expect(scope.relatedFiles).toEqual([]);
  expect(scope.profile).toBe('skip');
  expect(scope.detail).toBe(
    'profile=skip; skipped: no matching unit-test targets; reason=no product unit-test targets'
  );
});

it('treats web-snapshot-viewer as a manifest-owned runtime entrypoint', () => {
  const scope = resolveBuildTestScope({
    targetFiles: ['apps/extension/manifest.json'],
    codeFiles: [],
    repoCodeFiles: [
      'apps/extension/src/web-snapshot-viewer/index.tsx',
      'apps/extension/src/web-snapshot-viewer/entrypoint.ts',
      'apps/extension/src/popup/index.tsx',
    ],
  });

  expect(scope.matchedFamilies).toContain('manifest-owned');
  expect(scope.profile).toBe('related-transitive');
  expect(scope.relatedFiles).toEqual([
    'apps/extension/src/popup/index.tsx',
    'apps/extension/src/web-snapshot-viewer/entrypoint.ts',
    'apps/extension/src/web-snapshot-viewer/index.tsx',
  ]);
});

it('keeps deleted high-risk targets on the related profile', () => {
  const scope = resolveBuildTestScope({
    targetFiles: ['apps/extension/src/platform/runtime-messaging/deleted-client.ts'],
    codeFiles: [],
    repoCodeFiles: [
      'apps/extension/src/platform/runtime-messaging/client.ts',
      'apps/extension/src/platform/runtime-messaging/client.test.ts',
    ],
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.matchedFamilies).toEqual(['messaging-runtime', 'package-and-app-core']);
  expect(scope.relatedFiles).toEqual(['apps/extension/src/platform/runtime-messaging/client.ts']);
});

it('keeps high-risk runtime diffs on the transitive related profile', () => {
  const scope = resolveBuildTestScope({
    targetFiles: ['apps/extension/src/background/runtime/session.ts'],
    codeFiles: ['apps/extension/src/background/runtime/session.ts'],
    repoCodeFiles: ['apps/extension/src/background/runtime/session.ts'],
    focusedScopeResolver: () => ({
      detail: 'local owner tests=1; coverageTargets=1',
      testFiles: ['apps/extension/src/background/runtime/session.test.ts'],
      verdict: 'run-local-coverage',
    }),
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.directTestFiles).toEqual([]);
  expect(scope.relatedFiles).toEqual(['apps/extension/src/background/runtime/session.ts']);
});

it('falls back to related tests when a small owner scope is ambiguous', () => {
  const scope = resolveBuildTestScope({
    targetFiles: ['apps/extension/src/popup/shell/app/view.tsx'],
    codeFiles: ['apps/extension/src/popup/shell/app/view.tsx'],
    repoCodeFiles: ['apps/extension/src/popup/shell/app/view.tsx'],
    focusedScopeResolver: () => ({
      detail: 'existing file without owner',
      testFiles: [],
      verdict: 'defer-ambiguous-existing',
    }),
    ownerTestResolver: () => [],
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.relatedFiles).toEqual(['apps/extension/src/popup/shell/app/view.tsx']);
  expect(scope.profileReason).toContain('ambiguous');
});

it('keeps public package changes on the related profile even with mapped tests', () => {
  const scope = resolveBuildTestScope({
    targetFiles: ['packages/ui/src/button.tsx'],
    codeFiles: ['packages/ui/src/button.tsx'],
    repoCodeFiles: ['packages/ui/src/button.tsx'],
    focusedScopeResolver: () => ({
      detail: 'local owner tests=1; coverageTargets=1',
      testFiles: ['packages/ui/src/button.test.tsx'],
      verdict: 'run-local-coverage',
    }),
    ownerTestResolver: () => ['packages/ui/src/button.test.tsx'],
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.relatedFiles).toEqual(['packages/ui/src/button.tsx']);
});

it('keeps large local changes on the related profile', () => {
  const codeFiles = Array.from(
    { length: BUILD_TEST_PROFILE_LIMITS.codeFiles + 1 },
    (_, index) => `apps/extension/src/popup/shell/app/view-${index}.tsx`
  );
  const scope = resolveBuildTestScope({
    targetFiles: codeFiles,
    codeFiles,
    repoCodeFiles: codeFiles,
    focusedScopeResolver: () => ({
      detail: 'local owner tests=1; coverageTargets=1',
      testFiles: ['apps/extension/src/popup/shell/app/view.test.tsx'],
      verdict: 'run-local-coverage',
    }),
    ownerTestResolver: () => ['apps/extension/src/popup/shell/app/view.test.tsx'],
  });

  expect(scope.profile).toBe('related-transitive');
  expect(scope.relatedFiles).toEqual(codeFiles);
});
