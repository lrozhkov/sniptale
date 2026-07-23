import { expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd, writeFile } from './test-helpers';

it('keeps focused unit-test scope strictly on changed diff test files', async () => {
  const root = createTempRoot('focused-diff-tests-');
  const files = [
    'src/example/feature/page.tsx',
    'src/example/feature/page.test.tsx',
    'src/example/feature/workflow.spec.ts',
  ];
  for (const file of files) writeFile(root, file, 'export {}\n');

  const focusedFiles = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-focused.test-steps.mjs')>(
      './verify-focused.test-steps.mjs'
    );
    return module.collectFocusedDiffTestFiles(files);
  });

  expect(focusedFiles).toEqual([
    'src/example/feature/page.test.tsx',
    'src/example/feature/workflow.spec.ts',
  ]);
});
