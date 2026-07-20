import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from './test-helpers';

async function loadModule(root: string) {
  return withCwd(root, () =>
    importFresh<typeof import('./import-only-diff.mjs')>('./import-only-diff.mjs', import.meta.url)
  );
}

function commitBaseline(root: string) {
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
}

it('detects files whose diff only rewrites module-surface declarations', async () => {
  const root = createTempRoot('import-only-diff-');
  initGitRepo(root);
  writeFile(
    root,
    'src/example.test.ts',
    [
      "import { VideoQuality, type VideoRecordingSettings } from '../shared/video-types';",
      '',
      'const quality = VideoQuality.HIGH;',
      'const settings = {} as VideoRecordingSettings;',
      'expect(quality).toBeTruthy();',
      'expect(settings).toBeTruthy();',
      '',
    ].join('\n')
  );
  commitBaseline(root);
  writeFile(
    root,
    'src/example.test.ts',
    [
      "import { VideoQuality } from '../shared/video-types/types';",
      "import type { VideoRecordingSettings } from '../shared/video-types/types';",
      '',
      'const quality = VideoQuality.HIGH;',
      'const settings = {} as VideoRecordingSettings;',
      'expect(quality).toBeTruthy();',
      'expect(settings).toBeTruthy();',
      '',
    ].join('\n')
  );

  const result = await withCwd(root, async () => {
    const module = await loadModule(root);
    return module.isImportOnlyDiffFile('src/example.test.ts');
  });

  expect(result).toBe(true);
});

it('detects pure staged renames as non-behavioral diffs', async () => {
  const root = createTempRoot('import-only-diff-pure-rename-');
  initGitRepo(root);
  writeFile(
    root,
    'src/old-owner/facade.ts',
    ["export { createThing } from './thing';", "export type { Thing } from './types';", ''].join(
      '\n'
    )
  );
  commitBaseline(root);
  runGit(root, 'mv', 'src/old-owner', 'src/new-owner');

  const result = await withCwd(root, async () => {
    const module = await loadModule(root);
    return module.isImportOnlyDiffFile('src/new-owner/facade.ts');
  });

  expect(result).toBe(true);
});

it('does not hide files with non-import changes', async () => {
  const root = createTempRoot('import-only-diff-code-');
  initGitRepo(root);
  writeFile(
    root,
    'src/example.test.ts',
    "import { value } from './value';\nexpect(value).toBe(1);\n"
  );
  commitBaseline(root);
  writeFile(
    root,
    'src/example.test.ts',
    "import { value } from './value';\nexpect(value).toBe(2);\n"
  );

  const result = await withCwd(root, async () => {
    const module = await loadModule(root);
    return module.isImportOnlyDiffFile('src/example.test.ts');
  });

  expect(result).toBe(false);
});

it('detects erased type-only contract renames as non-behavioral diffs', async () => {
  const root = createTempRoot('import-only-diff-type-only-');
  initGitRepo(root);
  writeFile(
    root,
    'src/runtime.ts',
    [
      "import type { PopupExportState } from './session';",
      '',
      'export function startRuntime(state: PopupExportState): string {',
      '  return state.id;',
      '}',
      '',
    ].join('\n')
  );
  commitBaseline(root);
  writeFile(
    root,
    'src/runtime.ts',
    [
      "import type { PopupExportRuntimeContract } from './runtime-state';",
      '',
      'export function startRuntime(state: PopupExportRuntimeContract): string {',
      '  return state.id;',
      '}',
      '',
    ].join('\n')
  );

  const result = await withCwd(root, async () => {
    const module = await loadModule(root);
    return module.isImportOnlyDiffFile('src/runtime.ts');
  });

  expect(result).toBe(true);
});

it('treats declaration file changes as type-only without TypeScript output generation', async () => {
  const root = createTempRoot('import-only-diff-declaration-');
  initGitRepo(root);
  writeFile(
    root,
    'src/vendor/adapter.d.mts',
    ['export interface Adapter {', '  start(): void;', '}', ''].join('\n')
  );
  commitBaseline(root);
  writeFile(
    root,
    'src/vendor/adapter.d.mts',
    ['export interface Adapter {', '  start(options?: unknown): void;', '}', ''].join('\n')
  );

  const result = await withCwd(root, async () => {
    const module = await loadModule(root);
    return module.isImportOnlyDiffFile('src/vendor/adapter.d.mts');
  });

  expect(result).toBe(true);
});

it('does not try to classify non-JS files as import-only diffs', async () => {
  const root = createTempRoot('import-only-diff-json-');
  initGitRepo(root);
  writeFile(
    root,
    'apps/extension/manifest.json',
    JSON.stringify({ icons: { 16: 'src/icons/icon-16.png' } })
  );
  commitBaseline(root);
  writeFile(
    root,
    'apps/extension/manifest.json',
    JSON.stringify({ icons: { 16: 'icons/icon-16.png' } })
  );

  const result = await withCwd(root, async () => {
    const module = await loadModule(root);
    return module.isImportOnlyDiffFile('apps/extension/manifest.json');
  });

  expect(result).toBe(false);
});

it('does not hide non-import changes after a staged rename', async () => {
  const root = createTempRoot('import-only-diff-rename-code-');
  initGitRepo(root);
  writeFile(
    root,
    'src/old-owner/example.test.ts',
    ["import { value } from '../shared/value';", '', 'expect(value).toBe(1);', ''].join('\n')
  );
  commitBaseline(root);
  runGit(root, 'mv', 'src/old-owner', 'src/new-owner');
  writeFile(
    root,
    'src/new-owner/example.test.ts',
    ["import { value } from '../shared/value/index';", '', 'expect(value).toBe(2);', ''].join('\n')
  );

  const result = await withCwd(root, async () => {
    const module = await loadModule(root);
    return module.isImportOnlyDiffFile('src/new-owner/example.test.ts');
  });

  expect(result).toBe(false);
});

it('detects files whose diff only rewrites imports and top-level mocks', async () => {
  const root = createTempRoot('import-mock-only-diff-');
  initGitRepo(root);
  writeFile(
    root,
    'src/example.test.ts',
    [
      "import { VideoQuality } from '../shared/video-types';",
      "vi.mock('../shared/video-project/project/defaults', () => ({ getAssetById: vi.fn() }));",
      '',
      'const quality = VideoQuality.HIGH;',
      'expect({ id: "project-1" } as never).toBeTruthy();',
      'expect(quality).toBeTruthy();',
      '',
    ].join('\n')
  );
  commitBaseline(root);
  writeFile(
    root,
    'src/example.test.ts',
    [
      "import { VideoQuality } from '../shared/video-types/types';",
      "vi.mock('../shared/video-project/timeline', () => ({ getAssetById: vi.fn() }));",
      '',
      'const quality = VideoQuality.HIGH;',
      'expect({ id: "project-1" } as never).toBeTruthy();',
      'expect(quality).toBeTruthy();',
      '',
    ].join('\n')
  );

  const result = await withCwd(root, async () => {
    const module = await loadModule(root);
    return {
      importOnly: module.isImportOnlyDiffFile('src/example.test.ts'),
      importOrMockOnly: module.isImportOrMockOnlyDiffFile('src/example.test.ts'),
    };
  });

  expect(result).toEqual({ importOnly: true, importOrMockOnly: true });
});

it('detects import-only diffs after a staged rename', async () => {
  const root = createTempRoot('import-only-diff-rename-');
  initGitRepo(root);
  writeFile(
    root,
    'src/old-owner/example.test.ts',
    ["import { value } from '../shared/value';", '', 'expect(value).toBeTruthy();', ''].join('\n')
  );
  commitBaseline(root);
  runGit(root, 'mv', 'src/old-owner', 'src/new-owner');
  writeFile(
    root,
    'src/new-owner/example.test.ts',
    ["import { value } from '../shared/value/index';", '', 'expect(value).toBeTruthy();', ''].join(
      '\n'
    )
  );

  const result = await withCwd(root, async () => {
    const module = await loadModule(root);
    return module.isImportOnlyDiffFile('src/new-owner/example.test.ts');
  });

  expect(result).toBe(true);
});
