import { expect, it } from 'vitest';

import { createTempRoot, withCwd, writeFile, writeJson } from './test-helpers';

function createCycleGraphRoot(prefix: string) {
  const root = createTempRoot(prefix);
  writeJson(root, 'tsconfig.json', {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
    },
    include: ['src'],
  });
  writeJson(root, 'package.json', { name: prefix, type: 'module' });
  return root;
}

function createCycleGraphConfig(tsPreCompilationDeps = true) {
  return {
    forbidden: [
      {
        name: 'no-circular',
        severity: 'warn',
        from: {},
        to: { circular: true },
      },
    ],
    options: {
      tsPreCompilationDeps,
      tsConfig: { fileName: 'tsconfig.json' },
    },
  };
}

async function runCycleGraph(root: string) {
  const module = await import('../guards/architecture/verify-cycles.mjs');
  return withCwd(root, () =>
    module.runCycleCheck({
      root: 'src',
      configOverride: createCycleGraphConfig(),
    })
  );
}

function expectCycleBetween(cycles: string[][], left: string, right: string) {
  expect(cycles.some((cycle) => cycle.includes(left) && cycle.includes(right))).toBe(true);
}

it('detects value import cycles with dependency-cruiser', async () => {
  const root = createCycleGraphRoot('verify-value-cycles-');
  writeFile(root, 'src/a.ts', "import { valueB } from './b';\nexport const valueA = valueB;\n");
  writeFile(root, 'src/b.ts', "import { valueA } from './a';\nexport const valueB = valueA;\n");

  const cycles = await runCycleGraph(root);

  expectCycleBetween(cycles, 'src/a.ts', 'src/b.ts');
}, 20000);

it('detects re-export cycles with dependency-cruiser', async () => {
  const root = createCycleGraphRoot('verify-reexport-cycles-');
  writeFile(root, 'src/a.ts', "export { valueB } from './b';\nexport const valueA = 1;\n");
  writeFile(root, 'src/b.ts', "export { valueA } from './a';\nexport const valueB = 1;\n");

  const cycles = await runCycleGraph(root);

  expectCycleBetween(cycles, 'src/a.ts', 'src/b.ts');
}, 20000);

it('detects type-only cycles when tsPreCompilationDeps is enabled', async () => {
  const root = createCycleGraphRoot('verify-type-cycles-');
  writeFile(root, 'src/a.ts', "import type { B } from './b';\nexport type A = { b: B };\n");
  writeFile(root, 'src/b.ts', "import type { A } from './a';\nexport type B = { a: A };\n");

  const cycles = await runCycleGraph(root);

  expectCycleBetween(cycles, 'src/a.ts', 'src/b.ts');
}, 20000);

it('returns an empty cycle list for an acyclic dependency graph', async () => {
  const root = createCycleGraphRoot('verify-acyclic-graph-');
  writeFile(root, 'src/a.ts', "import { valueB } from './b';\nexport const valueA = valueB;\n");
  writeFile(root, 'src/b.ts', 'export const valueB = 1;\n');

  const cycles = await runCycleGraph(root);

  expect(cycles).toEqual([]);
}, 20000);

it('keeps dependency-cruiser cycle extraction free of absolute temp paths', async () => {
  const root = createCycleGraphRoot('verify-cycle-paths-');
  writeFile(root, 'src/a.ts', "import { valueB } from './b';\nexport const valueA = valueB;\n");
  writeFile(root, 'src/b.ts', "import { valueA } from './a';\nexport const valueB = valueA;\n");

  const cycles = await runCycleGraph(root);

  expect(cycles.flat().some((entry) => entry.startsWith(root))).toBe(false);
  expectCycleBetween(cycles, 'src/a.ts', 'src/b.ts');
}, 20000);

it('extracts cycles from dependency flags when summary violations are absent', async () => {
  const { extractCircularDependencyChains } = await import('./dependency-graph-runner.mjs');
  const cycles = extractCircularDependencyChains({
    summary: { violations: [] },
    modules: [
      {
        source: '/tmp/example/src/a.ts',
        dependencies: [
          {
            circular: true,
            cycle: [{ name: '/tmp/example/src/b.ts' }, { name: '/tmp/example/src/a.ts' }],
          },
        ],
      },
    ],
  });

  expect(cycles).toEqual([['src/a.ts', 'src/b.ts', 'src/a.ts']]);
});
