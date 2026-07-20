import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from './test-helpers';

it('keeps changed mock implementations in strict focused lint scope', async () => {
  const root = createTempRoot('mock-implementation-diff-');
  initGitRepo(root);
  writeFile(
    root,
    'src/example.test.ts',
    "vi.mock('../shared/runtime', () => ({ readValue: vi.fn() }));\n"
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeFile(
    root,
    'src/example.test.ts',
    "vi.mock('../shared/runtime', () => ({ readValue: async () => JSON.parse('{}') }));\n"
  );

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./import-only-diff.mjs')>(
      './import-only-diff.mjs',
      import.meta.url
    );
    return {
      importOnly: module.isImportOnlyDiffFile('src/example.test.ts'),
      importOrMockOnly: module.isImportOrMockOnlyDiffFile('src/example.test.ts'),
    };
  });

  expect(result).toEqual({ importOnly: false, importOrMockOnly: true });
});
