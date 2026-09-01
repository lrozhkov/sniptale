import { expect, it } from 'vitest';

import {
  classifyProductTestFiles,
  collectProductTestInventory,
  JSDOM_VM_THREADS_COMPATIBILITY_FILES,
  NODE_VM_THREADS_COMPATIBILITY_FILES,
} from './product-test-inventory.mjs';

function createFixture(overrides: Record<string, string> = {}) {
  const sources = {
    'apps/extension/src/feature/browser.test.ts': '// @vitest-environment jsdom\n',
    'apps/extension/src/feature/node.test.ts': "import { it } from 'vitest';\n",
    'apps/extension/src/feature/node-vm.test.ts': "import { it } from 'vitest';\n",
    'packages/ui/src/view.test.tsx': '// @vitest-environment jsdom\n',
    ...overrides,
  };
  return {
    files: Object.keys(sources).sort(),
    readFile: (file: string) => sources[file as keyof typeof sources],
  };
}

it('creates a stable disjoint product project partition', () => {
  const fixture = createFixture();
  const jsdomCompatibilityFiles = [
    { file: 'apps/extension/src/feature/browser.test.ts', reason: 'redefines window' },
  ];
  const nodeCompatibilityFiles = [
    { file: 'apps/extension/src/feature/node.test.ts', reason: 'cross-realm Error' },
  ];
  const first = classifyProductTestFiles({
    ...fixture,
    jsdomCompatibilityFiles,
    nodeCompatibilityFiles,
  });
  const second = classifyProductTestFiles({
    ...fixture,
    jsdomCompatibilityFiles,
    nodeCompatibilityFiles,
  });

  expect(first).toEqual(second);
  expect(first.jsdomVmThreadsFiles).toEqual(['packages/ui/src/view.test.tsx']);
  expect(first.nodeVmThreadsFiles).toEqual(['apps/extension/src/feature/node-vm.test.ts']);
  expect(first.threadsFiles).toEqual([
    'apps/extension/src/feature/browser.test.ts',
    'apps/extension/src/feature/node.test.ts',
  ]);
  expect(
    new Set([...first.jsdomVmThreadsFiles, ...first.nodeVmThreadsFiles, ...first.threadsFiles])
  ).toEqual(new Set(first.files));
});

it('fails closed on directive and compatibility drift', () => {
  const misplaced = createFixture({
    'apps/extension/src/feature/browser.test.ts':
      "import { it } from 'vitest';\n// @vitest-environment jsdom\n",
  });
  expect(() =>
    classifyProductTestFiles({
      ...misplaced,
      jsdomCompatibilityFiles: [],
      nodeCompatibilityFiles: [],
    })
  ).toThrow('must be the first line');

  const fixture = createFixture();
  expect(() =>
    classifyProductTestFiles({
      ...fixture,
      jsdomCompatibilityFiles: [{ file: 'missing.test.ts', reason: 'missing' }],
      nodeCompatibilityFiles: [],
    })
  ).toThrow('jsdom vmThreads compatibility file is missing');
  expect(() =>
    classifyProductTestFiles({
      ...fixture,
      jsdomCompatibilityFiles: [
        { file: 'apps/extension/src/feature/node.test.ts', reason: 'not jsdom' },
      ],
      nodeCompatibilityFiles: [],
    })
  ).toThrow('is not a jsdom test');
  expect(() =>
    classifyProductTestFiles({
      ...fixture,
      jsdomCompatibilityFiles: [],
      nodeCompatibilityFiles: [
        { file: 'apps/extension/src/feature/browser.test.ts', reason: 'not node' },
      ],
    })
  ).toThrow('is not a node test');
  expect(() =>
    classifyProductTestFiles({
      ...fixture,
      jsdomCompatibilityFiles: [
        { file: 'apps/extension/src/feature/browser.test.ts', reason: 'duplicate' },
      ],
      nodeCompatibilityFiles: [
        { file: 'apps/extension/src/feature/browser.test.ts', reason: 'duplicate' },
      ],
    })
  ).toThrow('unique sorted path list');
});

it('classifies the complete live product inventory and closed compatibility registry', () => {
  const inventory = collectProductTestInventory();
  expect(inventory.identities.all.count).toBeGreaterThan(0);
  expect(inventory.identities.jsdomCompatibility.count).toBe(
    JSDOM_VM_THREADS_COMPATIBILITY_FILES.length
  );
  expect(inventory.identities.nodeCompatibility.count).toBe(
    NODE_VM_THREADS_COMPATIBILITY_FILES.length
  );
  expect(
    inventory.jsdomVmThreadsFiles.length +
      inventory.nodeVmThreadsFiles.length +
      inventory.threadsFiles.length
  ).toBe(inventory.files.length);
  expect(inventory.jsdomVmThreadsFiles).not.toEqual(
    expect.arrayContaining(JSDOM_VM_THREADS_COMPATIBILITY_FILES.map(({ file }) => file))
  );
  expect(inventory.nodeVmThreadsFiles).not.toEqual(
    expect.arrayContaining(NODE_VM_THREADS_COMPATIBILITY_FILES.map(({ file }) => file))
  );
});
