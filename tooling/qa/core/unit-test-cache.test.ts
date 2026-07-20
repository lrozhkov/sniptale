import fs from 'node:fs';

import { expect, it } from 'vitest';

import { createTempRoot, withCwd, writeFile, writeJson } from './test-helpers';

function writeUnitTestConfigFiles(root: string) {
  writeJson(root, 'package.json', { name: 'unit-test-cache-test' });
  writeFile(root, 'vitest.config.ts', 'export default { test: {} };\n');
  writeFile(root, 'tooling/test/harness/vitest.setup.ts', 'export {};\n');
}

it('reuses the exact related unit-test plan when mode and expanded files match', async () => {
  const root = createTempRoot('unit-test-cache-');
  writeUnitTestConfigFiles(root);
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');
  writeFile(root, 'src/example.test.ts', 'export const testValue = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await import('./unit-test-cache.mjs');
    module.recordSuccessfulUnitTestPlan({
      cwd: root,
      targetFiles: ['src/example.ts'],
      relatedFiles: ['src/example.ts'],
      source: 'focused',
    });

    return module.resolveReusableUnitTestPlan({
      cwd: root,
      targetFiles: ['src/example.ts'],
      relatedFiles: ['src/example.ts'],
    });
  });

  expect(result).toEqual({
    matched: true,
    plan: expect.objectContaining({
      mode: 'related',
      expandedRelatedFiles: ['src/example.ts', 'src/example.test.ts'],
      coverage: false,
    }),
    source: 'focused',
  });
});

it('does not reuse a related unit-test cache for a full-suite plan', async () => {
  const root = createTempRoot('unit-test-cache-mode-');
  writeUnitTestConfigFiles(root);
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');
  writeFile(root, 'src/example.test.ts', 'export const testValue = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await import('./unit-test-cache.mjs');
    module.recordSuccessfulUnitTestPlan({
      cwd: root,
      targetFiles: ['src/example.ts'],
      relatedFiles: ['src/example.ts'],
      source: 'focused',
    });

    return module.resolveReusableUnitTestPlan({
      cwd: root,
      targetFiles: ['src/example.ts'],
      relatedFiles: [],
    });
  });

  expect(result).toEqual({
    matched: false,
    reason: 'required execution mode changed',
  });
});

it('requires the cached coverage artifact before reusing a coverage-backed plan', async () => {
  const root = createTempRoot('unit-test-cache-coverage-');
  writeUnitTestConfigFiles(root);
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');
  writeFile(root, '.tmp/coverage/unit/coverage-final.json', '{}\n');

  const matchedResult = await withCwd(root, async () => {
    const module = await import('./unit-test-cache.mjs');
    module.recordSuccessfulUnitTestPlan({
      cwd: root,
      targetFiles: ['src/example.ts'],
      relatedFiles: ['src/example.ts'],
      coverage: true,
      source: 'full-verify',
    });

    return module.resolveReusableUnitTestPlan({
      cwd: root,
      targetFiles: ['src/example.ts'],
      relatedFiles: ['src/example.ts'],
      coverage: true,
    });
  });

  expect(matchedResult).toEqual({
    matched: true,
    plan: expect.objectContaining({
      coverage: true,
      mode: 'related',
    }),
    source: 'full-verify',
  });

  const missingArtifactResult = await withCwd(root, async () => {
    const module = await import('./unit-test-cache.mjs');
    fs.rmSync(`${root}/.tmp/coverage/unit/coverage-final.json`);
    return module.resolveReusableUnitTestPlan({
      cwd: root,
      targetFiles: ['src/example.ts'],
      relatedFiles: ['src/example.ts'],
      coverage: true,
    });
  });

  expect(missingArtifactResult).toEqual({
    matched: false,
    reason: 'cached coverage artifact missing',
  });
});

it('reuses a focused coverage-backed related unit-test plan when the artifact still exists', async () => {
  const root = createTempRoot('unit-test-cache-focused-coverage-');
  writeUnitTestConfigFiles(root);
  writeFile(root, 'apps/extension/src/background/example.ts', 'export const value = 1;\n');
  writeFile(root, '.tmp/coverage/unit/coverage-final.json', '{}\n');

  const result = await withCwd(root, async () => {
    const module = await import('./unit-test-cache.mjs');
    module.recordSuccessfulUnitTestPlan({
      cwd: root,
      targetFiles: ['apps/extension/src/background/example.ts'],
      relatedFiles: ['apps/extension/src/background/example.ts'],
      coverage: true,
      source: 'focused',
    });

    return module.resolveReusableUnitTestPlan({
      cwd: root,
      targetFiles: ['apps/extension/src/background/example.ts'],
      relatedFiles: ['apps/extension/src/background/example.ts'],
      coverage: true,
    });
  });

  expect(result).toEqual({
    matched: true,
    plan: expect.objectContaining({
      coverage: true,
      mode: 'related',
    }),
    source: 'focused',
  });
});

it('does not reuse a coverage-backed unit-test cache when the coverage mode changed', async () => {
  const root = createTempRoot('unit-test-cache-coverage-mode-');
  writeUnitTestConfigFiles(root);
  writeFile(root, 'apps/extension/src/background/example.ts', 'export const value = 1;\n');
  writeFile(root, '.tmp/coverage/unit/coverage-final.json', '{}\n');

  const result = await withCwd(root, async () => {
    const module = await import('./unit-test-cache.mjs');
    module.recordSuccessfulUnitTestPlan({
      cwd: root,
      targetFiles: ['apps/extension/src/background/example.ts'],
      relatedFiles: ['apps/extension/src/background/example.ts'],
      coverage: true,
      coverageMode: 'diff',
      coverageTargets: ['apps/extension/src/background/example.ts'],
      source: 'focused',
    });

    return module.resolveReusableUnitTestPlan({
      cwd: root,
      targetFiles: ['apps/extension/src/background/example.ts'],
      relatedFiles: ['apps/extension/src/background/example.ts'],
      coverage: true,
      coverageMode: 'full',
      coverageTargets: [],
    });
  });

  expect(result).toEqual({
    matched: false,
    reason: 'required execution inputs changed',
  });
});

it('does not reuse a unit-test cache across suites or pools', async () => {
  const root = createTempRoot('unit-test-cache-suite-pool-');
  writeUnitTestConfigFiles(root);
  writeFile(root, 'tooling/example.mjs', 'export const value = 1;\n');
  writeFile(root, 'tooling/example.test.ts', 'export const testValue = 1;\n');

  const result = await withCwd(root, async () => {
    const module = await import('./unit-test-cache.mjs');
    module.recordSuccessfulUnitTestPlan({
      cwd: root,
      targetFiles: ['tooling/example.mjs'],
      relatedFiles: ['tooling/example.mjs'],
      pool: 'forks',
      source: 'release-harness',
      suite: 'harness',
    });

    return module.resolveReusableUnitTestPlan({
      cwd: root,
      targetFiles: ['tooling/example.mjs'],
      relatedFiles: ['tooling/example.mjs'],
      pool: 'threads',
      suite: 'product',
    });
  });

  expect(result).toEqual({
    matched: false,
    reason: 'required execution inputs changed',
  });
});

it('does not reuse a focused unit-test cache when the workspace target files changed', async () => {
  const root = createTempRoot('unit-test-cache-workspace-');
  writeUnitTestConfigFiles(root);
  writeFile(root, 'src/example.ts', 'export const value = 1;\n');
  writeFile(root, 'docs/note.md', '# note\n');

  const result = await withCwd(root, async () => {
    const module = await import('./unit-test-cache.mjs');
    module.recordSuccessfulUnitTestPlan({
      cwd: root,
      targetFiles: ['src/example.ts'],
      relatedFiles: ['src/example.ts'],
      source: 'focused',
    });

    return module.resolveReusableUnitTestPlan({
      cwd: root,
      targetFiles: ['docs/note.md', 'src/example.ts'],
      relatedFiles: ['src/example.ts'],
    });
  });

  expect(result).toEqual({
    matched: false,
    reason: 'workspace state changed since the last successful execution',
  });
});
