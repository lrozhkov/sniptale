import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from './test-helpers';

async function seedFreshAdvisoryState() {
  const diffHelpers = await importFresh<typeof import('../runtime/current-diff.helpers.mjs')>(
    '../runtime/current-diff.helpers.mjs'
  );
  const advisoryHelpers = await importFresh<typeof import('./verify-advisory.state.helpers.mjs')>(
    './verify-advisory.state.helpers.mjs'
  );
  const context = diffHelpers.collectCurrentDiffContext();
  advisoryHelpers.writeAdvisoryState(
    advisoryHelpers.createAdvisoryState({
      context,
      success: true,
    })
  );
}

function seedRequiredQualityBaseline(root: string) {
  writeFile(
    root,
    'tooling/configs/qa/quality-baseline.json',
    '{"schemaVersion":1,"allowances":[]}\n'
  );
}

it('rejects explicit file scopes because focused verify is diff-only', async () => {
  const module = await import('./verify-focused.mjs');

  await expect(
    module.runFocusedVerification({
      files: ['AGENTS.md', 'tooling/qa/core/verify-focused.mjs'],
    })
  ).rejects.toThrow(/current uncommitted diff only/u);
}, 15000);

it('discovers changed tracked and untracked files when no explicit files are provided', async () => {
  const root = createTempRoot('verify-focused-');
  initGitRepo(root);
  seedRequiredQualityBaseline(root);
  writeFile(root, '.gitignore', '.tmp/\n');
  writeFile(root, 'package.json', '{"name":"verify-focused-temp"}\n');
  writeFile(root, 'tracked.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'init');

  writeFile(root, 'tracked.ts', 'export const value = 2;\n');
  writeFile(root, 'untracked.ts', 'export const next = 3;\n');

  const result = await withCwd(root, async () => {
    await seedFreshAdvisoryState();
    const focused =
      await importFresh<typeof import('./verify-focused.mjs')>('./verify-focused.mjs');
    return focused.runFocusedVerification();
  });

  expect(result.targetFiles).toEqual(['tracked.ts', 'untracked.ts']);
  expect(result.existingTargetFiles).toEqual(['tracked.ts', 'untracked.ts']);
  expect(result.codeFiles).toEqual(['tracked.ts', 'untracked.ts']);
});

it('excludes changed harness files from focused product verification', async () => {
  const root = createTempRoot('verify-focused-product-scope-');
  initGitRepo(root);
  seedRequiredQualityBaseline(root);
  writeFile(root, '.gitignore', '.tmp/\n');
  writeFile(root, 'package.json', '{"name":"verify-focused-temp"}\n');
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');
  writeFile(root, 'tooling/qa/core/example.test.ts', 'export const testValue = 1;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'init');

  writeFile(root, 'src/example.ts', 'export const value = 2;\n');
  writeFile(root, 'tooling/qa/core/example.test.ts', 'export const testValue = 2;\n');

  const result = await withCwd(root, async () => {
    await seedFreshAdvisoryState();
    const focused =
      await importFresh<typeof import('./verify-focused.mjs')>('./verify-focused.mjs');
    return focused.runFocusedVerification();
  });

  expect(result.targetFiles).toEqual(['src/example.ts']);
  expect(result.harnessTargetFiles).toEqual(['tooling/qa/core/example.test.ts']);
});

it('ignores tasks artifacts when resolving focused diff targets', async () => {
  const root = createTempRoot('verify-focused-task-artifacts-');
  initGitRepo(root);
  seedRequiredQualityBaseline(root);
  writeFile(root, '.gitignore', '.tmp/\n');
  writeFile(root, 'package.json', '{"name":"verify-focused-temp"}\n');
  writeFile(root, 'tracked.ts', 'export const value = 1;\n');
  writeFile(root, 'tasks/plan.md', '# initial plan\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'init');

  writeFile(root, 'tracked.ts', 'export const value = 2;\n');
  writeFile(root, 'tasks/plan.md', '# changed plan\n');
  writeFile(root, 'tasks/local-note.md', '# root untracked note\n');

  const result = await withCwd(root, async () => {
    await seedFreshAdvisoryState();
    const focused =
      await importFresh<typeof import('./verify-focused.mjs')>('./verify-focused.mjs');
    return focused.runFocusedVerification();
  });

  expect(result.targetFiles).toEqual(['tracked.ts']);
  expect(result.existingTargetFiles).toEqual(['tracked.ts']);
  expect(result.codeFiles).toEqual(['tracked.ts']);
});

it('tracks deleted paths in the focused fingerprint without treating them as existing code files', async () => {
  const root = createTempRoot('verify-focused-deleted-');
  initGitRepo(root);
  seedRequiredQualityBaseline(root);
  writeFile(root, '.gitignore', '.tmp/\n');
  writeFile(root, 'package.json', '{"name":"verify-focused-temp"}\n');
  writeFile(root, 'tracked.ts', 'export const value = 1;\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'init');

  runGit(root, 'rm', 'tracked.ts');

  const result = await withCwd(root, async () => {
    await seedFreshAdvisoryState();
    const focused =
      await importFresh<typeof import('./verify-focused.mjs')>('./verify-focused.mjs');
    return focused.runFocusedVerification();
  });

  expect(result.targetFiles).toEqual(['tracked.ts']);
  expect(result.existingTargetFiles).toEqual([]);
  expect(result.codeFiles).toEqual([]);
  expect(result.jsLikeFiles).toEqual([]);
});

it('uses changed guarded files for focused i18n coverage', async () => {
  const module = await import('./verify-focused.mjs');

  expect(
    module.collectFocusedI18nFiles([
      'apps/extension/src/content/overlay/toolbar/view.tsx',
      'src/shared/logger.ts',
    ])
  ).toEqual(['apps/extension/src/content/overlay/toolbar/view.tsx']);
});

it('expands focused i18n coverage when i18n contracts change', async () => {
  const module = await import('./verify-focused.mjs');

  expect(module.collectFocusedI18nFiles(['apps/extension/src/platform/i18n/index.ts'])).toContain(
    'apps/extension/src/content/overlay/toolbar/view.tsx'
  );
});

it('collects focused storage-write-pattern files for targeted persistence seams', async () => {
  const module = await import('./verify-focused.mjs');

  expect(
    module.collectFocusedStorageWritePatternFiles([
      'apps/extension/src/composition/persistence/storage/example.ts',
      'apps/extension/src/settings/sections/save-presets/actions/index.ts',
      'apps/extension/src/popup/index.tsx',
    ])
  ).toEqual([
    'apps/extension/src/composition/persistence/storage/example.ts',
    'apps/extension/src/settings/sections/save-presets/actions/index.ts',
  ]);
});

it('runs dependency-graph triggers only for topology-level files', async () => {
  const module = await import('./verify-focused.mjs');

  expect(module.shouldRunDependencyGraph(['apps/extension/vite.config.ts'])).toBe(true);
  expect(
    module.shouldRunDependencyGraph(['apps/extension/src/content/overlay/toolbar/view.tsx'])
  ).toBe(false);
});

it('runs canonical-facade checks for changed same-name owner facades', async () => {
  const root = createTempRoot('verify-focused-canonical-facades-');
  initGitRepo(root);
  seedRequiredQualityBaseline(root);
  writeFile(root, '.gitignore', '.tmp/\n');
  writeFile(root, 'package.json', '{"name":"verify-focused-temp"}\n');
  writeFile(root, 'apps/extension/src/content/selection/locker.ts', "export * from './locker';\n");
  writeFile(
    root,
    'apps/extension/src/content/selection/locker/index.ts',
    'export const value = 1;\n'
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'init');

  writeFile(root, 'apps/extension/src/content/selection/locker.ts', "export * from './locker';\n");

  const result = await withCwd(root, async () => {
    const focused =
      await importFresh<typeof import('./verify-focused.mjs')>('./verify-focused.mjs');
    return focused.shouldRunCanonicalFacades(['apps/extension/src/content/selection/locker.ts']);
  });

  expect(result).toBe(true);
});

it('runs canonical-facade checks for changed src files', async () => {
  const module = await import('./verify-focused.mjs');

  expect(module.shouldRunCanonicalFacades(['apps/extension/src/content/feature.ts'])).toBe(true);
  expect(module.shouldRunCanonicalFacades(['docs/tooling/code-quality.md'])).toBe(false);
});

it('runs focused typecheck for TypeScript-bearing changes outside topology triggers too', async () => {
  const module = await import('./verify-focused.mjs');

  expect(
    module.shouldRunFocusedTypecheck(['apps/extension/src/content/overlay/toolbar/view.tsx'])
  ).toBe(true);
  expect(module.shouldRunFocusedTypecheck(['tooling/qa/core/verify-focused.mjs'])).toBe(false);
});

it('includes changed app-owned product TypeScript in focused dead-export coverage', async () => {
  const root = createTempRoot('verify-focused-dead-exports-');
  initGitRepo(root);
  seedRequiredQualityBaseline(root);
  writeFile(root, '.gitignore', '.tmp/\n');
  writeFile(root, 'package.json', '{"name":"verify-focused-temp"}\n');
  writeFile(
    root,
    'apps/extension/src/content/selection/frame-runtime/react/useFrameManager.ts',
    'export const value = 1;\n'
  );
  writeFile(root, 'docs/tooling/wrapper-summary.md', '# wrapper\n');
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'init');

  writeFile(
    root,
    'apps/extension/src/content/selection/frame-runtime/react/useFrameManager.ts',
    'export const value = 2;\n'
  );
  writeFile(root, 'docs/tooling/wrapper-summary.md', '# wrapper updated\n');

  const result = await withCwd(root, async () => {
    await seedFreshAdvisoryState();
    const focused =
      await importFresh<typeof import('./verify-focused.mjs')>('./verify-focused.mjs');
    return focused.runFocusedVerification();
  });

  expect(result.existingTargetFiles).toEqual([
    'apps/extension/src/content/selection/frame-runtime/react/useFrameManager.ts',
    'docs/tooling/wrapper-summary.md',
  ]);
  expect(result.codeFiles).toEqual([
    'apps/extension/src/content/selection/frame-runtime/react/useFrameManager.ts',
  ]);
});

it('resolves focused diff-coverage targets only for rollout-covered production files', async () => {
  const module = await import('./verify-focused.mjs');

  expect(
    module.resolveFocusedCoverageTargetFiles([
      'docs/tooling/wrapper-summary.md',
      'tooling/qa/core/verify-focused.mjs',
      'apps/extension/src/gallery/library/actions/backup.ts',
    ])
  ).toEqual(['apps/extension/src/gallery/library/actions/backup.ts']);
});
