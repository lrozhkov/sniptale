import { expect, it } from 'vitest';

import { importFresh } from '../../test-support/test-helpers';
import {
  collectProductTestInventory,
  PRODUCT_TEST_GLOBS,
} from '../../../test/harness/product-test-inventory.mjs';
import { collectProductionCoverageFiles } from '../coverage/coverage-audit-report.mjs';
import { globSync } from 'tinyglobby';

it('uses the wrapper coverage profile when the wrapper env is set', async () => {
  process.env.SNIPTALE_VITEST_SUITE = 'product';
  delete process.env.SNIPTALE_PRODUCT_VITEST_POOL;
  process.env.SNIPTALE_PRODUCT_VITEST_PARTITION = 'jsdom-vm';
  process.env.SNIPTALE_VITEST_COVERAGE_MODE = 'diff';
  process.env.SNIPTALE_VITEST_COVERAGE_TARGETS = JSON.stringify([
    'src/shared/example.ts',
    'apps/extension/src/background/example.ts',
  ]);
  process.env.SNIPTALE_VITEST_TIMEOUT_MODE = 'wrapper';

  const module = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );

  expect(module.default.test?.coverage).toMatchObject({
    reporter: ['json'],
    include: ['src/shared/example.ts', 'apps/extension/src/background/example.ts'],
    processingConcurrency: 8,
    provider: 'v8',
  });
  expect(module.default.test?.clearMocks).toBe(false);
  expect(module.default.test?.coverage).not.toHaveProperty('customProviderModule');
  expect(module.default.test?.testTimeout).toBe(15000);
  expect(module.default.test?.hookTimeout).toBe(15000);
  expect(module.default.test?.include).toEqual(collectProductTestInventory().jsdomVmThreadsFiles);
  expect(module.default.test?.pool).toBe('vmThreads');
  expect(module.default.test?.vmMemoryLimit).toBe('512MB');
  delete process.env.SNIPTALE_PRODUCT_VITEST_PARTITION;
});

it('uses the full wrapper coverage profile when full wrapper coverage is requested', async () => {
  process.env.SNIPTALE_VITEST_SUITE = 'product';
  process.env.SNIPTALE_PRODUCT_VITEST_POOL = 'threads';
  delete process.env.SNIPTALE_PRODUCT_VITEST_PARTITION;
  process.env.SNIPTALE_VITEST_COVERAGE_MODE = 'full';
  delete process.env.SNIPTALE_VITEST_COVERAGE_TARGETS;
  delete process.env.SNIPTALE_VITEST_TIMEOUT_MODE;

  const module = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );

  expect(module.default.test?.coverage).toMatchObject({
    reporter: ['json'],
    include: ['apps/extension/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
  });
  expect(module.default.test?.include).toEqual([
    'apps/extension/src/**/*.{test,spec}.{ts,tsx}',
    'packages/*/src/**/*.{test,spec}.{ts,tsx}',
  ]);
  expect(module.default.test?.pool).toBe('threads');
  delete process.env.SNIPTALE_PRODUCT_VITEST_POOL;
});

it('assigns the complete product inventory once to inherited shared-server coverage projects', async () => {
  process.env.SNIPTALE_VITEST_SUITE = 'product';
  process.env.SNIPTALE_PRODUCT_VITEST_PROJECTS = '1';
  process.env.SNIPTALE_VITEST_COVERAGE_MODE = 'full';
  delete process.env.SNIPTALE_PRODUCT_VITEST_POOL;
  delete process.env.SNIPTALE_PRODUCT_VITEST_PARTITION;
  const module = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );
  const inventory = collectProductTestInventory();
  expect(module.default.test?.include).toEqual([]);
  expect(module.default.test?.vmMemoryLimit).toBe('512MB');
  expect(module.default.test?.projects).toEqual([
    {
      test: {
        name: 'vm',
        include: PRODUCT_TEST_GLOBS,
        exclude: inventory.threadsFiles,
        pool: 'vmThreads',
      },
    },
    { test: { name: 'threads', include: inventory.threadsFiles, pool: 'threads' } },
  ]);
  const vmFiles = globSync(PRODUCT_TEST_GLOBS, {
    ignore: [...(module.default.test?.exclude ?? []), ...inventory.threadsFiles],
  }).sort();
  expect(vmFiles).toEqual(
    [...inventory.jsdomVmThreadsFiles, ...inventory.nodeVmThreadsFiles].sort()
  );
  expect([...vmFiles, ...inventory.threadsFiles].sort()).toEqual(inventory.files);
  expect(module.default.test?.setupFiles).toEqual(['./tooling/test/harness/vitest.setup.ts']);
  expect(module.default.test?.clearMocks).toBe(false);
  expect(module.default.test?.coverage?.reportsDirectory).toBe('./.tmp/coverage/unit');
  expect(module.default.test?.coverage?.provider).toBe('v8');
  process.env.SNIPTALE_PRODUCT_VITEST_POOL = 'threads';
  const override = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );
  expect(override.default.test?.projects).toBeUndefined();
  expect(override.default.test?.pool).toBe('threads');
  delete process.env.SNIPTALE_PRODUCT_VITEST_PROJECTS;
  delete process.env.SNIPTALE_PRODUCT_VITEST_POOL;
});

it.each(['manual', 'full'])(
  'resolves %s product coverage to the canonical registry',
  async (mode) => {
    process.env.SNIPTALE_VITEST_SUITE = 'product';
    process.env.SNIPTALE_VITEST_COVERAGE_MODE = mode;
    delete process.env.SNIPTALE_VITEST_COVERAGE_TARGETS;
    delete process.env.SNIPTALE_PRODUCT_VITEST_PARTITION;
    const module = await importFresh<typeof import('../../../../vitest.config.ts')>(
      '../../../../vitest.config.ts',
      import.meta.url
    );
    const coverage = module.default.test?.coverage;
    expect(globSync(coverage?.include ?? [], { ignore: coverage?.exclude }).sort()).toEqual(
      collectProductionCoverageFiles()
    );
  }
);

it.each(['product', 'all'])('preserves empty diff coverage targets for %s', async (suite) => {
  process.env.SNIPTALE_VITEST_SUITE = suite;
  process.env.SNIPTALE_VITEST_COVERAGE_MODE = 'diff';
  process.env.SNIPTALE_VITEST_COVERAGE_TARGETS = '[]';
  const module = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );
  const coverage = module.default.test?.coverage;
  expect(coverage?.include).toEqual([
    'apps/extension/src/**/*.{ts,tsx}',
    'packages/*/src/**/*.{ts,tsx}',
  ]);
  expect(globSync(coverage?.include ?? [], { ignore: coverage?.exclude })).toContain(
    'apps/extension/src/background/ai/llm/router.test-support.ts'
  );
});

it('projects exact node vmThreads and compatibility threads partitions', async () => {
  process.env.SNIPTALE_VITEST_SUITE = 'product';
  delete process.env.SNIPTALE_PRODUCT_VITEST_POOL;
  delete process.env.SNIPTALE_VITEST_COVERAGE_MODE;
  process.env.SNIPTALE_PRODUCT_VITEST_PARTITION = 'node-vm';

  const nodeVm = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );
  expect(nodeVm.default.test?.include).toEqual(collectProductTestInventory().nodeVmThreadsFiles);
  expect(nodeVm.default.test?.pool).toBe('vmThreads');
  expect(nodeVm.default.test?.vmMemoryLimit).toBe('512MB');

  process.env.SNIPTALE_PRODUCT_VITEST_PARTITION = 'threads';
  const compatibility = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );
  expect(compatibility.default.test?.include).toEqual(collectProductTestInventory().threadsFiles);
  expect(compatibility.default.test?.pool).toBe('threads');
  delete process.env.SNIPTALE_PRODUCT_VITEST_PARTITION;
});

it('uses harness includes when the harness suite is requested', async () => {
  process.env.SNIPTALE_VITEST_SUITE = 'harness';
  process.env.SNIPTALE_COVERAGE_PROFILE = '1';
  delete process.env.SNIPTALE_VITEST_COVERAGE_MODE;
  delete process.env.SNIPTALE_VITEST_COVERAGE_TARGETS;
  delete process.env.SNIPTALE_VITEST_TIMEOUT_MODE;
  delete process.env.SNIPTALE_PRODUCT_VITEST_POOL;
  delete process.env.SNIPTALE_PRODUCT_VITEST_PARTITION;
  delete process.env.SNIPTALE_HARNESS_VITEST_PARTITION;

  const module = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );

  expect(module.default.test?.include).toEqual(['tooling/**/*.{test,spec}.{ts,tsx}']);
  expect(module.default.test?.exclude).toContain('tooling/test/e2e/**/*.spec.ts');
  expect(module.default.test?.coverage).toMatchObject({
    provider: 'v8',
    reportsDirectory: './.tmp/coverage/tooling',
    reporter: ['text', 'json-summary', 'json', 'html'],
    include: ['tooling/**/*.{mjs,cjs,js,ts,tsx}'],
    reportOnFailure: true,
    thresholds: {
      statements: 70,
      branches: 67,
      functions: 78,
      lines: 70,
    },
  });
  expect(module.default.test?.coverage?.exclude).toEqual(
    expect.arrayContaining([
      'tooling/**/*.{test,spec}.{mjs,cjs,js,ts,tsx}',
      'tooling/**/*.test-support.{mjs,cjs,js,ts,tsx}',
      'tooling/**/test-support/**',
      'tooling/**/fixtures/**',
      'tooling/test/harness/**',
      'tooling/test/e2e/support/**',
    ])
  );
  delete process.env.SNIPTALE_COVERAGE_PROFILE;
  delete process.env.SNIPTALE_PRODUCT_VITEST_POOL;
  delete process.env.SNIPTALE_PRODUCT_VITEST_PARTITION;
});

it('projects exact harness VM and forks partitions', async () => {
  process.env.SNIPTALE_VITEST_SUITE = 'harness';
  process.env.SNIPTALE_QA_VITEST_MAX_WORKERS = '4';
  process.env.SNIPTALE_HARNESS_VITEST_PARTITION = 'node-vm-a';
  const nodeVm = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );
  expect(nodeVm.default.test?.include?.length).toBeGreaterThan(0);
  expect(nodeVm.default.test?.pool).toBe('vmThreads');
  expect(nodeVm.default.test?.maxWorkers).toBe(4);

  process.env.SNIPTALE_HARNESS_VITEST_PARTITION = 'forks';
  const forks = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );
  expect(forks.default.test?.include?.length).toBeGreaterThan(0);
  expect(forks.default.test?.pool).toBe('forks');
  delete process.env.SNIPTALE_HARNESS_VITEST_PARTITION;
  delete process.env.SNIPTALE_QA_VITEST_MAX_WORKERS;
});

it('keeps the rich manual coverage profile by default', async () => {
  delete process.env.SNIPTALE_VITEST_SUITE;
  delete process.env.SNIPTALE_VITEST_COVERAGE_MODE;
  delete process.env.SNIPTALE_VITEST_COVERAGE_TARGETS;
  delete process.env.SNIPTALE_VITEST_TIMEOUT_MODE;
  delete process.env.SNIPTALE_COVERAGE_PROFILE;
  delete process.env.SNIPTALE_PRODUCT_VITEST_POOL;
  delete process.env.SNIPTALE_HARNESS_VITEST_PARTITION;

  const module = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );

  expect(module.default.test?.coverage).toMatchObject({
    provider: 'v8',
    reporter: ['text', 'json-summary', 'json', 'html'],
    include: [
      'apps/extension/src/**/*.{ts,tsx}',
      'packages/*/src/**/*.{ts,tsx}',
      'tooling/**/*.{mjs,cjs,js,ts,tsx}',
    ],
  });
});
