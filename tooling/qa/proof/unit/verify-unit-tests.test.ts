import { expect, it } from 'vitest';

import { createUnitTestPlan } from './unit-test-plan.mjs';
import {
  createUnitTestArgs,
  createUnitTestEnv,
  resolveProductUnitTestPool,
  resolveProductUnitTestPartitions,
  runUnitTests,
} from './verify-unit-tests.mjs';
import { requiresRelatedUnitTests } from '../coverage/test-coverage/thresholds.mjs';
import { createTempRoot, importFresh, withCwd, writeFile } from '../../test-support/test-helpers';

it('builds the full-suite vitest command by default', () => {
  expect(createUnitTestArgs()).toEqual(
    expect.arrayContaining([expect.stringContaining('node_modules/vitest/vitest.mjs'), 'run'])
  );
});

it('builds a focused related-test command for changed files', () => {
  expect(
    createUnitTestArgs({
      allowNoTests: true,
      relatedFiles: ['src/shared/example.ts', 'apps/extension/src/background/example.ts'],
    })
  ).toEqual(
    expect.arrayContaining([
      expect.stringContaining('node_modules/vitest/vitest.mjs'),
      'related',
      'src/shared/example.ts',
      'apps/extension/src/background/example.ts',
      '--run',
      '--passWithNoTests',
    ])
  );
});

it('builds a direct diff-test command when only changed test files should run', () => {
  expect(
    createUnitTestArgs({
      allowNoTests: true,
      directFiles: ['apps/extension/src/popup/shell/export/pages/page.test.tsx'],
    })
  ).toEqual(
    expect.arrayContaining([
      expect.stringContaining('node_modules/vitest/vitest.mjs'),
      'run',
      'apps/extension/src/popup/shell/export/pages/page.test.tsx',
      '--passWithNoTests',
    ])
  );
  expect(
    createUnitTestArgs({
      allowNoTests: true,
      directFiles: ['apps/extension/src/popup/shell/export/pages/page.test.tsx'],
    })
  ).not.toContain('related');
});

it('adds coverage to the focused related-test command when requested', () => {
  expect(
    createUnitTestArgs({
      allowNoTests: false,
      coverage: true,
      relatedFiles: ['src/shared/example.ts'],
    })
  ).toEqual(expect.arrayContaining(['related', 'src/shared/example.ts', '--coverage']));
  expect(
    createUnitTestArgs({
      allowNoTests: false,
      relatedFiles: ['src/shared/example.ts'],
    })
  ).not.toContain('--passWithNoTests');
  expect(
    createUnitTestArgs({
      allowNoTests: false,
      relatedFiles: ['src/shared/example.ts'],
    })
  ).not.toContain('--coverage.reporter=json');
});

it('adds an explicit pool when requested', () => {
  expect(createUnitTestArgs({ pool: 'threads' })).toContain('--pool=threads');
  expect(createUnitTestArgs({ pool: 'forks' })).toContain('--pool=forks');
});

it('uses config-owned projects by default and keeps an explicit rollback override', () => {
  expect(resolveProductUnitTestPool({})).toBeNull();
  expect(resolveProductUnitTestPool({ SNIPTALE_PRODUCT_VITEST_POOL: 'forks' })).toBe('forks');
});

it('splits only the config-owned product suite into sequential partitions', () => {
  expect(resolveProductUnitTestPartitions()).toEqual(['jsdom-vm', 'threads']);
  expect(resolveProductUnitTestPartitions({ coverage: true })).toEqual([null]);
  expect(resolveProductUnitTestPartitions({ pool: 'threads' })).toEqual([null]);
  expect(resolveProductUnitTestPartitions({ suite: 'harness' })).toEqual([null]);
  expect(createUnitTestEnv({ productPartition: 'jsdom-vm' })).toMatchObject({
    SNIPTALE_PRODUCT_VITEST_PARTITION: 'jsdom-vm',
  });
  expect(createUnitTestEnv({ pool: 'threads' })).toMatchObject({
    SNIPTALE_PRODUCT_VITEST_POOL: 'threads',
  });
});

it('collapses an inherited product pool rollback to one canonical runner invocation', () => {
  const invocations: Array<{
    args: string[];
    options: { env: Record<string, string | null> };
  }> = [];
  const result = runUnitTests({
    directFiles: ['apps/extension/src/content/parser/export-manager/service/assets.test.ts'],
    env: { SNIPTALE_PRODUCT_VITEST_POOL: 'threads' },
    execute: (_entry, args, options) => {
      invocations.push({ args, options });
      return { status: 0, stdout: 'passed\n', stderr: '' };
    },
  });

  expect(result.status).toBe(0);
  expect(invocations).toHaveLength(1);
  expect(invocations[0]?.args).toContain('--pool=threads');
  expect(invocations[0]?.options.env).toMatchObject({
    SNIPTALE_PRODUCT_VITEST_PARTITION: null,
    SNIPTALE_PRODUCT_VITEST_POOL: 'threads',
  });

  const harnessInvocations: typeof invocations = [];
  runUnitTests({
    directFiles: ['tooling/qa/proof/unit/unit-test-plan.test.ts'],
    env: { SNIPTALE_PRODUCT_VITEST_POOL: 'threads' },
    suite: 'harness',
    execute: (_entry, args, options) => {
      harnessInvocations.push({ args, options });
      return { status: 0, stdout: 'passed\n', stderr: '' };
    },
  });

  expect(harnessInvocations).toHaveLength(1);
  expect(harnessInvocations[0]?.args).not.toContain('--pool=threads');
  expect(harnessInvocations[0]?.options.env).toMatchObject({
    SNIPTALE_PRODUCT_VITEST_PARTITION: null,
    SNIPTALE_PRODUCT_VITEST_POOL: null,
  });
});

it('bounds vitest workers when requested and rejects invalid bounds', () => {
  expect(createUnitTestArgs({ maxWorkers: 6 })).toContain('--maxWorkers=6');
  expect(() => createUnitTestArgs({ maxWorkers: 0 })).toThrow(
    'Vitest maxWorkers must be a positive integer.'
  );
});

it('enables wrapper timeout mode for every wrapper unit-test run', () => {
  expect(createUnitTestEnv()).toMatchObject({
    SNIPTALE_QA_LANE_PROCESS: null,
    SNIPTALE_VITEST_TIMEOUT_MODE: 'wrapper',
    SNIPTALE_VITEST_SUITE: 'product',
  });
});

it('passes the harness suite through wrapper unit-test env', () => {
  expect(createUnitTestEnv({ suite: 'harness' })).toMatchObject({
    SNIPTALE_VITEST_SUITE: 'harness',
  });
});

it('enables diff wrapper coverage env only for diff coverage runs', () => {
  expect(
    createUnitTestEnv({
      coverage: true,
      coverageMode: 'diff',
      coverageTargets: ['src/shared/example.ts'],
    })
  ).toMatchObject({
    SNIPTALE_VITEST_COVERAGE_MODE: 'diff',
    SNIPTALE_VITEST_COVERAGE_TARGETS: JSON.stringify(['src/shared/example.ts']),
  });
  expect(createUnitTestEnv({ coverage: false })).not.toHaveProperty(
    'SNIPTALE_VITEST_COVERAGE_MODE'
  );
  expect(createUnitTestEnv({ coverage: true, coverageMode: 'manual' })).not.toHaveProperty(
    'SNIPTALE_VITEST_COVERAGE_MODE'
  );
});

it('supports full wrapper coverage without diff target env', () => {
  expect(createUnitTestEnv({ coverage: true, coverageMode: 'full' })).toMatchObject({
    SNIPTALE_VITEST_COVERAGE_MODE: 'full',
  });
  expect(createUnitTestEnv({ coverage: true, coverageMode: 'full' })).not.toHaveProperty(
    'SNIPTALE_VITEST_COVERAGE_TARGETS'
  );
});

it('requires related tests only for rollout-covered production seams', () => {
  expect(requiresRelatedUnitTests(['apps/extension/src/background/index.ts'])).toBe(true);
  expect(requiresRelatedUnitTests(['apps/extension/src/content/components/Callout.tsx'])).toBe(
    false
  );
  expect(requiresRelatedUnitTests(['docs/tooling/code-quality.md'])).toBe(false);
});

it('requires executable related proof for a non-rollout deletion successor', () => {
  const plan = createUnitTestPlan({
    relatedFiles: ['apps/extension/src/background/example/non-rollout-owner.ts'],
    requireTests: true,
  });

  expect(plan.allowNoTests).toBe(false);
  expect(
    createUnitTestArgs({
      allowNoTests: plan.allowNoTests,
      relatedFiles: plan.expandedRelatedFiles,
    })
  ).not.toContain('--passWithNoTests');
});

it('expands focused related-test scope with exact owner-local tests, not every sibling test', async () => {
  const root = createTempRoot('verify-unit-tests-');
  writeFile(
    root,
    'apps/extension/src/content/overlay/toolbar/view.tsx',
    'export const value = 1;\n'
  );
  writeFile(
    root,
    'apps/extension/src/content/overlay/toolbar/view.test.tsx',
    'export const testValue = 1;\n'
  );
  writeFile(
    root,
    'apps/extension/src/content/overlay/toolbar/static-tooltips.test.tsx',
    'export const unrelated = true;\n'
  );

  const expandedScope = await withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-unit-tests.mjs')>(
      '../proof/unit/verify-unit-tests.mjs'
    );
    return module.expandRelatedTestScope(['apps/extension/src/content/overlay/toolbar/view.tsx']);
  });

  expect(expandedScope).toEqual([
    'apps/extension/src/content/overlay/toolbar/view.tsx',
    'apps/extension/src/content/overlay/toolbar/view.test.tsx',
  ]);
});
