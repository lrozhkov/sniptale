import { expect, it } from 'vitest';
import { createRequire } from 'node:module';

import { createTempRoot, withCwd, writeFile, writeJson } from '../../test-support/test-helpers';

const require = createRequire(import.meta.url);
const repositoryBoundaryConfig = require('../../../../.dependency-cruiser.cjs');

it('builds one immutable graph artifact for each input digest', async () => {
  const { createDependencyGraphArtifactStore } = await import('./dependency-graph-runner.mjs');
  const store = createDependencyGraphArtifactStore();
  let buildCount = 0;
  const build = async () => ({ graph: ++buildCount });

  const [first, second, changed] = await Promise.all([
    store.ensureArtifact('same-digest', build),
    store.ensureArtifact('same-digest', build),
    store.ensureArtifact('changed-digest', build),
  ]);

  expect(second).toBe(first);
  expect(changed).not.toBe(first);
  expect(buildCount).toBe(2);
  expect(store.getStats()).toEqual({ artifactCount: 2, buildCount: 2 });
});

it('does not retain a failed graph build as reusable authority', async () => {
  const { createDependencyGraphArtifactStore } = await import('./dependency-graph-runner.mjs');
  const store = createDependencyGraphArtifactStore();

  await expect(
    store.ensureArtifact('digest', async () => {
      throw new Error('incomplete graph');
    })
  ).rejects.toThrow('incomplete graph');
  await expect(store.ensureArtifact('digest', async () => ({ complete: true }))).resolves.toEqual({
    complete: true,
  });
  expect(store.getStats()).toEqual({ artifactCount: 1, buildCount: 2 });
});

it('rejects corrupt artifacts and rebuilds when cached validation becomes stale', async () => {
  const { createDependencyGraphArtifactStore } = await import('./dependency-graph-runner.mjs');
  const store = createDependencyGraphArtifactStore();
  let generation = 0;
  let acceptedGeneration = 1;
  const build = async () => ({ generation: ++generation });
  const validate = (artifact: { generation: number }) => artifact.generation === acceptedGeneration;

  await expect(store.ensureArtifact('digest', build, { validate })).resolves.toEqual({
    generation: 1,
  });
  acceptedGeneration = 2;
  await expect(store.ensureArtifact('digest', build, { validate })).resolves.toEqual({
    generation: 2,
  });
  await expect(
    store.ensureArtifact('corrupt', async () => ({ generation: 99 }), { validate })
  ).rejects.toThrow('Dependency graph artifact validation failed');
  await expect(
    store.ensureArtifact('corrupt', async () => ({ generation: 2 }), { validate })
  ).resolves.toEqual({ generation: 2 });
  expect(store.getStats()).toEqual({ artifactCount: 2, buildCount: 4 });
});

it('invalidates the graph digest when source, config, scope root, or tsconfig changes', async () => {
  const { createGraphInputDigest } = await import('./dependency-graph-runner.mjs');
  const root = createCycleGraphRoot('dependency-graph-digest-');
  writeFile(root, '.dependency-cruiser.cjs', 'module.exports = {};\n');
  writeFile(root, 'src/a.ts', 'export const value = 1;\n');
  const config = createCycleGraphConfig();

  await withCwd(root, async () => {
    const initial = createGraphInputDigest({ configOverride: config, root: 'src', roots: [] });
    writeFile(root, 'src/a.ts', 'export const value = 2;\n');
    const sourceChanged = createGraphInputDigest({
      configOverride: config,
      root: 'src',
      roots: [],
    });
    writeJson(root, 'tsconfig.json', {
      compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler' },
      include: ['src'],
    });
    const tsconfigChanged = createGraphInputDigest({
      configOverride: config,
      root: 'src',
      roots: [],
    });
    const configChanged = createGraphInputDigest({
      configOverride: createCycleGraphConfig(false),
      root: 'src',
      roots: [],
    });
    const rootChanged = createGraphInputDigest({ configOverride: config, root: '.', roots: [] });

    expect(
      new Set([initial, sourceChanged, tsconfigChanged, configChanged, rootChanged]).size
    ).toBe(5);
  });
});

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
  const module = await import('../../guards/architecture/verify-cycles.mjs');
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

it('executes the package-direction rule through dependency-cruiser', async () => {
  const root = createTempRoot('verify-package-direction-');
  writeJson(root, 'tsconfig.json', {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
    },
    include: ['packages'],
  });
  writeJson(root, 'package.json', { name: 'package-direction-fixture', type: 'module' });
  writeFile(
    root,
    'packages/foundation/src/index.ts',
    "import { uiValue } from '../../ui/src/index';\nexport const value = uiValue;\n"
  );
  writeFile(root, 'packages/ui/src/index.ts', 'export const uiValue = true;\n');
  const config = {
    forbidden: [
      {
        name: 'foundation-package-direction',
        severity: 'error',
        from: { path: '^packages/foundation/' },
        to: { path: '^packages/ui/' },
      },
    ],
    options: {
      tsPreCompilationDeps: true,
      tsConfig: { fileName: 'tsconfig.json' },
    },
  };
  const module = await import('../../guards/architecture/verify-boundaries.mjs');

  const result = await withCwd(root, () =>
    module.runBoundaryCheck({ root: 'packages', roots: [], configOverride: config })
  );

  expect(result.exitCode).not.toBe(0);
  expect(result.output).toContain('foundation-package-direction');
}, 20000);

const heavyRuntimeCases = [
  {
    allowedPath: 'apps/extension/src/editor/canvas.ts',
    exportSource: 'export declare class Canvas {}\n',
    forbiddenPath: 'apps/extension/src/popup/canvas.ts',
    importSource: "import { Canvas } from 'fabric';\nexport const value = new Canvas();\n",
    packageName: 'fabric',
    ruleName: 'heavy-runtime-fabric-owner',
  },
  {
    allowedPath: 'apps/extension/src/composition/archive.ts',
    exportSource: 'export default class JSZip {}\n',
    forbiddenPath: 'apps/extension/src/content/archive.ts',
    importSource: "import JSZip from 'jszip';\nexport const value = new JSZip();\n",
    packageName: 'jszip',
    ruleName: 'heavy-runtime-jszip-content',
  },
  {
    allowedPath: 'packages/platform/src/security/sanitizers/html.ts',
    exportSource:
      'declare const DOMPurify: { sanitize(value: string): string };\nexport default DOMPurify;\n',
    forbiddenPath: 'apps/extension/src/content/sanitize.ts',
    importSource:
      "import DOMPurify from 'dompurify';\nexport const value = DOMPurify.sanitize('x');\n",
    packageName: 'dompurify',
    ruleName: 'heavy-runtime-dompurify-owner',
  },
] as const;

it.each(heavyRuntimeCases)(
  'enforces $packageName value-import ownership in the canonical dependency graph',
  async ({ allowedPath, exportSource, forbiddenPath, importSource, packageName, ruleName }) => {
    const root = createTempRoot(`dependency-graph-${packageName}-owner-`);
    writeJson(root, 'tsconfig.json', {
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'bundler',
      },
      include: ['apps', 'packages'],
    });
    writeJson(root, 'package.json', {
      name: `${packageName}-owner-fixture`,
      type: 'module',
      dependencies: { [packageName]: '1.0.0' },
    });
    writeJson(root, `node_modules/${packageName}/package.json`, {
      name: packageName,
      version: '1.0.0',
      types: 'index.d.ts',
    });
    writeFile(root, `node_modules/${packageName}/index.d.ts`, exportSource);
    writeFile(root, 'apps/extension/src/index.ts', 'export {};\n');
    writeFile(root, 'packages/platform/src/index.ts', 'export {};\n');
    writeFile(root, allowedPath, importSource);
    writeFile(root, forbiddenPath, importSource);
    const rule = repositoryBoundaryConfig.forbidden.find(
      ({ name }: { name: string }) => name === ruleName
    );
    const module = await import('../../guards/architecture/verify-boundaries.mjs');

    const result = await withCwd(root, () =>
      module.runBoundaryCheck({
        roots: ['apps/extension/src', 'packages/platform/src'],
        configOverride: {
          forbidden: [rule],
          options: {
            doNotFollow: { path: ['node_modules'] },
            tsPreCompilationDeps: true,
            tsConfig: { fileName: 'tsconfig.json' },
          },
        },
      })
    );

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain(ruleName);
    expect(result.output).toContain(forbiddenPath);
    expect(result.output).not.toContain(`${allowedPath} →`);
  },
  20_000
);

function createBoundaryFixtureRoot(prefix: string) {
  const root = createTempRoot(prefix);
  writeJson(root, 'tsconfig.json', {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
    },
    include: ['apps', 'packages'],
  });
  writeJson(root, 'package.json', { name: prefix, private: true, type: 'module' });
  return root;
}

function selectRepositoryBoundaryRules(ruleNames: string[]) {
  const selectedRules = repositoryBoundaryConfig.forbidden.filter((rule: { name: string }) =>
    ruleNames.includes(rule.name)
  );
  expect(selectedRules.map((rule: { name: string }) => rule.name).sort()).toEqual(
    [...ruleNames].sort()
  );
  return {
    forbidden: selectedRules,
    options: repositoryBoundaryConfig.options,
  };
}

async function runRepositoryBoundaryFixture(root: string, ruleNames: string[]) {
  const module = await import('../../guards/architecture/verify-boundaries.mjs');
  return withCwd(root, () =>
    module.runBoundaryCheck({
      root: '.',
      roots: [],
      configOverride: selectRepositoryBoundaryRules(ruleNames),
    })
  );
}

it.each([
  {
    name: 'runtime isolation',
    rule: 'runtime-isolation-background',
    from: 'apps/extension/src/background/entry.ts',
    to: 'apps/extension/src/popup/owner.ts',
    specifier: '../popup/owner',
  },
  {
    name: 'viewer content reuse outside preparation',
    rule: 'web-snapshot-viewer-content-reuse-scope',
    from: 'apps/extension/src/web-snapshot-viewer/runtime/entry.ts',
    to: 'apps/extension/src/content/owner.ts',
    specifier: '../../content/owner',
  },
  {
    name: 'package to application direction',
    rule: 'packages-never-import-app',
    from: 'packages/platform/src/entry.ts',
    to: 'apps/extension/src/background/owner.ts',
    specifier: '../../../apps/extension/src/background/owner',
  },
  {
    name: 'foundation package direction',
    rule: 'foundation-package-direction',
    from: 'packages/foundation/src/entry.ts',
    to: 'packages/platform/src/owner.ts',
    specifier: '../../platform/src/owner',
  },
  {
    name: 'runtime-contracts package direction',
    rule: 'runtime-contracts-package-direction',
    from: 'packages/runtime-contracts/src/entry.ts',
    to: 'packages/platform/src/owner.ts',
    specifier: '../../platform/src/owner',
  },
  {
    name: 'platform package direction',
    rule: 'platform-package-direction',
    from: 'packages/platform/src/entry.ts',
    to: 'packages/ui/src/owner.ts',
    specifier: '../../ui/src/owner',
  },
])(
  'blocks the current $name smell with the repository rule',
  async ({ from, rule, specifier, to }) => {
    const root = createBoundaryFixtureRoot(`verify-${rule}-`);
    writeFile(root, to, 'export const ownerValue = true;\n');
    writeFile(root, from, `import { ownerValue } from '${specifier}';\nexport { ownerValue };\n`);

    const result = await runRepositoryBoundaryFixture(root, [rule]);

    expect(result.exitCode).not.toBe(0);
    expect(result.output).toContain(rule);
  },
  20000
);

it('allows the one current viewer-preparation reuse edge', async () => {
  const root = createBoundaryFixtureRoot('verify-viewer-preparation-reuse-');
  writeFile(root, 'apps/extension/src/content/owner.ts', 'export const ownerValue = true;\n');
  writeFile(
    root,
    'apps/extension/src/web-snapshot-viewer/preparation/entry.ts',
    "import { ownerValue } from '../../content/owner';\nexport { ownerValue };\n"
  );

  const result = await runRepositoryBoundaryFixture(root, [
    'runtime-isolation-web-snapshot-viewer',
    'web-snapshot-viewer-content-reuse-scope',
  ]);

  expect(result.exitCode).toBe(0);
  expect(result.output).not.toContain('runtime-isolation-web-snapshot-viewer');
  expect(result.output).not.toContain('web-snapshot-viewer-content-reuse-scope');
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
