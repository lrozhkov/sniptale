import { expect, it } from 'vitest';

import { createTempRoot, withCwd, writeFile, writeJson } from './test-helpers';

function writeGraphConfigFiles(root: string) {
  writeFile(root, '.dependency-cruiser.cjs', 'module.exports = { forbidden: [], options: {} };\n');
  writeFile(root, 'tooling/qa/core/dependency-cruiser-options.cjs', 'module.exports = {};\n');
  writeFile(root, 'tooling/qa/core/dependency-cruiser-default-rules.cjs', 'module.exports = [];\n');
  writeFile(root, 'tooling/qa/core/dependency-graph-runner.mjs', 'export {};\n');
  writeFile(root, 'tooling/qa/guards/architecture/verify-boundaries.mjs', 'export {};\n');
  writeFile(root, 'tooling/qa/guards/architecture/verify-cycles.mjs', 'export {};\n');
  writeJson(root, 'tooling/qa/core/runtime-topology.data.json', []);
  writeJson(root, 'tsconfig.json', { compilerOptions: { strict: true }, include: ['src'] });
  writeJson(root, 'package.json', { name: 'graph-cache-test' });
}

it('reuses the boundary cache when the repo-wide graph fingerprint matches', async () => {
  const root = createTempRoot('dependency-graph-cache-');
  writeGraphConfigFiles(root);
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await import('./dependency-graph-cache.mjs');
    module.recordSuccessfulBoundaryCheck({
      cwd: root,
      targetFiles: ['src/example.ts'],
      source: 'focused',
    });

    return module.resolveReusableBoundaryCheck({
      cwd: root,
      targetFiles: ['src/example.ts'],
    });
  });

  expect(result).toEqual({
    matched: true,
    source: 'focused',
  });
});

it('invalidates the cycle cache after a tsconfig change', async () => {
  const root = createTempRoot('dependency-graph-cycle-cache-');
  writeGraphConfigFiles(root);
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await import('./dependency-graph-cache.mjs');
    module.recordSuccessfulCycleCheck({
      cwd: root,
      targetFiles: ['src/example.ts'],
      source: 'focused',
    });
    writeJson(root, 'tsconfig.json', {
      compilerOptions: { strict: true, noUncheckedIndexedAccess: true },
      include: ['src'],
    });

    return module.resolveReusableCycleCheck({
      cwd: root,
      targetFiles: ['src/example.ts'],
    });
  });

  expect(result).toEqual({
    matched: false,
    reason: 'workspace state changed since the last successful execution',
  });
});

it('invalidates the cycle cache after dependency-cruiser config changes', async () => {
  const root = createTempRoot('dependency-graph-cycle-config-cache-');
  writeGraphConfigFiles(root);
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await import('./dependency-graph-cache.mjs');
    module.recordSuccessfulCycleCheck({
      cwd: root,
      targetFiles: ['src/example.ts'],
      source: 'focused',
    });
    writeFile(
      root,
      '.dependency-cruiser.cjs',
      'module.exports = { forbidden: [], options: { tsPreCompilationDeps: false } };\n'
    );

    return module.resolveReusableCycleCheck({
      cwd: root,
      targetFiles: ['src/example.ts'],
    });
  });

  expect(result).toEqual({
    matched: false,
    reason: 'workspace state changed since the last successful execution',
  });
});

it('invalidates the cycle cache after dependency-cruiser options change', async () => {
  const root = createTempRoot('dependency-graph-cycle-options-cache-');
  writeGraphConfigFiles(root);
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await import('./dependency-graph-cache.mjs');
    module.recordSuccessfulCycleCheck({
      cwd: root,
      targetFiles: ['src/example.ts'],
      source: 'focused',
    });
    writeFile(
      root,
      'tooling/qa/core/dependency-cruiser-options.cjs',
      'module.exports = { tsPreCompilationDeps: false };\n'
    );

    return module.resolveReusableCycleCheck({
      cwd: root,
      targetFiles: ['src/example.ts'],
    });
  });

  expect(result).toEqual({
    matched: false,
    reason: 'workspace state changed since the last successful execution',
  });
});

it('invalidates graph caches after the shared graph runner changes', async () => {
  const root = createTempRoot('dependency-graph-runner-cache-');
  writeGraphConfigFiles(root);
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await import('./dependency-graph-cache.mjs');
    module.recordSuccessfulBoundaryCheck({
      cwd: root,
      targetFiles: ['src/example.ts'],
      source: 'focused',
    });
    module.recordSuccessfulCycleCheck({
      cwd: root,
      targetFiles: ['src/example.ts'],
      source: 'focused',
    });
    writeFile(root, 'tooling/qa/core/dependency-graph-runner.mjs', 'export const version = 2;\n');

    return {
      boundary: module.resolveReusableBoundaryCheck({
        cwd: root,
        targetFiles: ['src/example.ts'],
      }),
      cycle: module.resolveReusableCycleCheck({
        cwd: root,
        targetFiles: ['src/example.ts'],
      }),
    };
  });

  expect(result).toEqual({
    boundary: {
      matched: false,
      reason: 'workspace state changed since the last successful execution',
    },
    cycle: {
      matched: false,
      reason: 'workspace state changed since the last successful execution',
    },
  });
});
