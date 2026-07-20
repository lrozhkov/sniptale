import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from './test-helpers';

it('excludes import-or-top-level-mock-only product test diffs from focused direct tests', async () => {
  const root = createTempRoot('focused-import-mock-only-test-');
  initGitRepo(root);
  writeFile(
    root,
    'apps/extension/src/background/runtime/routing/route.test.ts',
    [
      "import { expect, it, vi } from 'vitest';",
      "import { route } from './legacy-route';",
      "vi.mock('../legacy-owner', () => ({ createRoute: vi.fn() }));",
      '',
      "it('keeps route visible', () => expect(route).toBeTruthy());",
      '',
    ].join('\n')
  );
  runGit(root, 'add', '.');
  runGit(root, 'commit', '-m', 'baseline');
  writeFile(
    root,
    'apps/extension/src/background/runtime/routing/route.test.ts',
    [
      "import { expect, it, vi } from 'vitest';",
      "import { route } from './route';",
      "vi.mock('../runtime/owner', () => ({ createRoute: vi.fn() }));",
      '',
      "it('keeps route visible', () => expect(route).toBeTruthy());",
      '',
    ].join('\n')
  );

  const result = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-focused.test-steps.mjs')>(
      './verify-focused.test-steps.mjs',
      import.meta.url
    );
    return module.collectFocusedDiffTestFiles([
      'apps/extension/src/background/runtime/routing/route.test.ts',
    ]);
  });

  expect(result).toEqual([]);
});
