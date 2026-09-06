import { expect, it } from 'vitest';

import {
  classifyHarnessTestFiles,
  collectHarnessTestInventory,
} from './harness-test-inventory.mjs';

it('partitions harness tests into complete disjoint pool-compatible populations', () => {
  const sources = new Map([
    ['tooling/a.test.ts', 'it("a", () => {});'],
    ['tooling/b.test.ts', 'it("b", () => {});'.repeat(10)],
    ['tooling/browser.test.ts', '// @vitest-environment jsdom\nit("browser", () => {});'],
    ['tooling/cwd.test.ts', 'process.chdir("/tmp");'],
  ]);
  const inventory = classifyHarnessTestFiles({
    files: [...sources.keys()].sort(),
    readFile: (file: string) => sources.get(file) ?? '',
  });

  expect(inventory.jsdomVmThreadsFiles).toEqual(['tooling/browser.test.ts']);
  expect(inventory.forkFiles).toEqual(['tooling/cwd.test.ts']);
  expect(
    new Set([
      ...inventory.forkFiles,
      ...inventory.jsdomVmThreadsFiles,
      ...inventory.nodeVmThreadsFilesA,
      ...inventory.nodeVmThreadsFilesB,
    ])
  ).toEqual(new Set(sources.keys()));
});

it('keeps the repository harness inventory complete and balances node VM source weight', () => {
  const inventory = collectHarnessTestInventory();
  const projected = [
    ...inventory.forkFiles,
    ...inventory.jsdomVmThreadsFiles,
    ...inventory.nodeVmThreadsFilesA,
    ...inventory.nodeVmThreadsFilesB,
  ];
  expect(new Set(projected).size).toBe(inventory.files.length);
  expect(inventory.forkFiles).toContain('tooling/qa/wrappers/advisory.test.ts');
  expect(inventory.nodeVmThreadsFilesA.length).toBeGreaterThan(0);
  expect(inventory.nodeVmThreadsFilesB.length).toBeGreaterThan(0);
});
