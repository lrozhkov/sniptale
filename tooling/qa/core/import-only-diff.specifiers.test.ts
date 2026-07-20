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

it('detects dynamic import specifier rewrites as non-behavioral diffs', async () => {
  const root = createTempRoot('import-only-diff-dynamic-import-');
  initGitRepo(root);
  writeFile(
    root,
    'src/runtime.ts',
    [
      'export function start(): void {',
      "  void import('../shared/message-tracer').then(({ initTracer }) => initTracer('popup'));",
      '}',
      '',
    ].join('\n')
  );
  commitBaseline(root);
  writeFile(
    root,
    'src/runtime.ts',
    [
      'export function start(): void {',
      "  void import('../shared/platform/message-tracer').then(({ initTracer }) => initTracer('popup'));",
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

it('detects nested mock specifier rewrites as non-behavioral diffs', async () => {
  const root = createTempRoot('import-only-diff-nested-mock-');
  initGitRepo(root);
  writeFile(
    root,
    'src/example.test.ts',
    [
      "import { expect, it, vi } from 'vitest';",
      "it('uses a nested mock', async () => {",
      "  vi.doMock('../shared/i18n', () => ({ translate: (key: string) => key }));",
      "  expect((await import('./subject')).value).toBeTruthy();",
      '});',
      '',
    ].join('\n')
  );
  commitBaseline(root);
  writeFile(
    root,
    'src/example.test.ts',
    [
      "import { expect, it, vi } from 'vitest';",
      "it('uses a nested mock', async () => {",
      "  vi.doMock('../shared/platform/i18n', () => ({ translate: (key: string) => key }));",
      "  expect((await import('./subject')).value).toBeTruthy();",
      '});',
      '',
    ].join('\n')
  );

  const result = await withCwd(root, async () => {
    const module = await loadModule(root);
    return module.isImportOrMockOnlyDiffFile('src/example.test.ts');
  });

  expect(result).toBe(true);
});
