import { expect, it } from 'vitest';

it('keeps focused unit-test scope strictly on changed diff test files', async () => {
  const module = await import('./verify-focused.test-steps.mjs');

  const files = [
    'src/example/feature/page.tsx',
    'src/example/feature/page.test.tsx',
    'src/example/feature/workflow.spec.ts',
  ];
  expect(module.collectFocusedDiffTestFiles(files)).toEqual([
    'src/example/feature/page.test.tsx',
    'src/example/feature/workflow.spec.ts',
  ]);
});
