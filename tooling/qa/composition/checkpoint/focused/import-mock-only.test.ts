import { expect, it } from 'vitest';

import {
  createTempRoot,
  importFresh,
  initGitRepo,
  runGit,
  withCwd,
  writeFile,
} from '../../../test-support/test-helpers';
import { FOCUSED_CODE_VIOLATION_STEPS } from './code-steps.mjs';
import { resolveFocusedCodeStepFiles } from './execution.mjs';

it('keeps import-only path candidates visible to the naming topology guard', () => {
  const codeFiles = ['apps/extension/src/ui/panel/panel-facade.ts'];
  const naming = FOCUSED_CODE_VIOLATION_STEPS.find(([label]) => label === 'Naming');

  expect(naming?.[3]).toEqual({ preserveImportOnly: true });
  expect(resolveFocusedCodeStepFiles(naming?.[3], codeFiles, [])).toEqual(codeFiles);
});

it('keeps import-only and type-only candidates visible to suppression policy', () => {
  const codeFiles = ['apps/extension/src/contracts/suppressed.ts'];
  const suppression = FOCUSED_CODE_VIOLATION_STEPS.find(
    ([label]) => label === 'Suppression directives'
  );

  expect(suppression?.[3]).toEqual({ preserveImportOnly: true });
  expect(resolveFocusedCodeStepFiles(suppression?.[3], codeFiles, [])).toEqual(codeFiles);
});

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
    const module = await importFresh<typeof import('./test-steps.mjs')>(
      './test-steps.mjs',
      import.meta.url
    );
    return module.collectFocusedDiffTestFiles([
      'apps/extension/src/background/runtime/routing/route.test.ts',
    ]);
  });

  expect(result).toEqual([]);
});
