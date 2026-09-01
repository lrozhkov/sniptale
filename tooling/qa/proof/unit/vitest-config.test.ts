import { expect, it } from 'vitest';

import { importFresh } from '../../test-support/test-helpers';

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
    all: false,
    customProviderModule: './tooling/qa/proof/coverage/profile-v8-coverage-provider.mjs',
    reporter: ['json'],
    include: ['src/shared/example.ts', 'apps/extension/src/background/example.ts'],
    processingConcurrency: 8,
    provider: 'custom',
  });
  expect(module.default.test?.testTimeout).toBe(15000);
  expect(module.default.test?.hookTimeout).toBe(15000);
  expect(module.default.test?.include).toHaveLength(1954);
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
    all: false,
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

it('projects exact node vmThreads and compatibility threads partitions', async () => {
  process.env.SNIPTALE_VITEST_SUITE = 'product';
  delete process.env.SNIPTALE_PRODUCT_VITEST_POOL;
  delete process.env.SNIPTALE_VITEST_COVERAGE_MODE;
  process.env.SNIPTALE_PRODUCT_VITEST_PARTITION = 'node-vm';

  const nodeVm = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );
  expect(nodeVm.default.test?.include).toHaveLength(2782);
  expect(nodeVm.default.test?.pool).toBe('vmThreads');
  expect(nodeVm.default.test?.vmMemoryLimit).toBe('512MB');

  process.env.SNIPTALE_PRODUCT_VITEST_PARTITION = 'threads';
  const compatibility = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );
  expect(compatibility.default.test?.include).toHaveLength(13);
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

  const module = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );

  expect(module.default.test?.include).toEqual(['tooling/**/*.{test,spec}.{ts,tsx}']);
  expect(module.default.test?.exclude).toContain('tooling/test/e2e/**/*.spec.ts');
  expect(module.default.test?.coverage).toMatchObject({
    provider: 'v8',
    all: true,
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

it('keeps the rich manual coverage profile by default', async () => {
  delete process.env.SNIPTALE_VITEST_SUITE;
  delete process.env.SNIPTALE_VITEST_COVERAGE_MODE;
  delete process.env.SNIPTALE_VITEST_COVERAGE_TARGETS;
  delete process.env.SNIPTALE_VITEST_TIMEOUT_MODE;
  delete process.env.SNIPTALE_COVERAGE_PROFILE;
  delete process.env.SNIPTALE_PRODUCT_VITEST_POOL;

  const module = await importFresh<typeof import('../../../../vitest.config.ts')>(
    '../../../../vitest.config.ts',
    import.meta.url
  );

  expect(module.default.test?.coverage).toMatchObject({
    all: true,
    provider: 'v8',
    reporter: ['text', 'json-summary', 'json', 'html'],
    include: [
      'apps/extension/src/**/*.{ts,tsx}',
      'packages/*/src/**/*.{ts,tsx}',
      'tooling/**/*.{mjs,cjs,js,ts,tsx}',
    ],
  });
});
