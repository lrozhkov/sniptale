import { expect, it } from 'vitest';

import {
  classifyProductTestFiles,
  collectProductTestInventory,
  VM_THREADS_COMPATIBILITY_FILES,
} from './product-test-inventory.mjs';

function createFixture(overrides: Record<string, string> = {}) {
  const sources = {
    'apps/extension/src/feature/browser.test.ts': '// @vitest-environment jsdom\n',
    'apps/extension/src/feature/node.test.ts': "import { it } from 'vitest';\n",
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
  const compatibilityFiles = [
    { file: 'apps/extension/src/feature/browser.test.ts', reason: 'redefines window' },
  ];
  const first = classifyProductTestFiles({ ...fixture, compatibilityFiles });
  const second = classifyProductTestFiles({ ...fixture, compatibilityFiles });

  expect(first).toEqual(second);
  expect(first.vmThreadsFiles).toEqual(['packages/ui/src/view.test.tsx']);
  expect(first.threadsFiles).toEqual([
    'apps/extension/src/feature/browser.test.ts',
    'apps/extension/src/feature/node.test.ts',
  ]);
  expect(new Set([...first.vmThreadsFiles, ...first.threadsFiles])).toEqual(new Set(first.files));
});

it('fails closed on directive and compatibility drift', () => {
  const misplaced = createFixture({
    'apps/extension/src/feature/browser.test.ts':
      "import { it } from 'vitest';\n// @vitest-environment jsdom\n",
  });
  expect(() => classifyProductTestFiles({ ...misplaced, compatibilityFiles: [] })).toThrow(
    'must be the first line'
  );

  const fixture = createFixture();
  expect(() =>
    classifyProductTestFiles({
      ...fixture,
      compatibilityFiles: [{ file: 'missing.test.ts', reason: 'missing' }],
    })
  ).toThrow('compatibility file is missing');
  expect(() =>
    classifyProductTestFiles({
      ...fixture,
      compatibilityFiles: [
        { file: 'apps/extension/src/feature/node.test.ts', reason: 'not jsdom' },
      ],
    })
  ).toThrow('is not a jsdom test');
});

it('classifies the complete live product inventory and closed compatibility registry', () => {
  const inventory = collectProductTestInventory();
  expect(inventory.identities.all.count).toBeGreaterThan(0);
  expect(inventory.identities.compatibility.count).toBe(VM_THREADS_COMPATIBILITY_FILES.length);
  expect(inventory.vmThreadsFiles.length + inventory.threadsFiles.length).toBe(
    inventory.files.length
  );
  expect(inventory.vmThreadsFiles).not.toEqual(
    expect.arrayContaining(VM_THREADS_COMPATIBILITY_FILES.map(({ file }) => file))
  );
});
