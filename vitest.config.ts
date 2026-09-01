import { defineConfig } from 'vitest/config';

import { collectProductTestInventory } from './tooling/test/harness/product-test-inventory.mjs';

type SniptaleVitestSuite = 'product' | 'harness' | 'all';

function parseWrapperCoverageTargets() {
  const rawValue = process.env.SNIPTALE_VITEST_COVERAGE_TARGETS;
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(
      (value): value is string => typeof value === 'string' && value.length > 0
    );
  } catch {
    return [];
  }
}

const wrapperCoverageMode = process.env.SNIPTALE_VITEST_COVERAGE_MODE ?? 'manual';
const wrapperCoverageTargets = parseWrapperCoverageTargets();
const isWrapperCoverageMode = wrapperCoverageMode !== 'manual';
const isWrapperTimeoutMode = process.env.SNIPTALE_VITEST_TIMEOUT_MODE === 'wrapper';
const vitestSuite = resolveVitestSuite(process.env.SNIPTALE_VITEST_SUITE);
const useBatchedProductCoverage = vitestSuite === 'product';
const productPoolOverride =
  vitestSuite === 'product'
    ? resolveProductPoolOverride(process.env.SNIPTALE_PRODUCT_VITEST_POOL)
    : undefined;
const productPartition =
  vitestSuite === 'product' && productPoolOverride === undefined
    ? resolveProductPartition(process.env.SNIPTALE_PRODUCT_VITEST_PARTITION)
    : undefined;
const productTestInventory = productPartition ? collectProductTestInventory() : null;
const TOOLING_COVERAGE_THRESHOLDS = {
  statements: 70,
  branches: 67,
  functions: 78,
  lines: 70,
};

function resolveVitestSuite(value: string | undefined): SniptaleVitestSuite {
  if (value == null || value === '') {
    return 'all';
  }
  if (value === 'product' || value === 'harness' || value === 'all') {
    return value;
  }

  throw new Error(`Unsupported SNIPTALE_VITEST_SUITE "${value}"`);
}

function resolveProductPoolOverride(value: string | undefined) {
  if (value == null || value === '') return undefined;
  if (value === 'forks' || value === 'threads') return value;
  throw new Error(`Unsupported SNIPTALE_PRODUCT_VITEST_POOL "${value}"`);
}

function resolveProductPartition(value: string | undefined) {
  if (value == null || value === '') return undefined;
  if (value === 'jsdom-vm' || value === 'node-vm' || value === 'threads') return value;
  throw new Error(`Unsupported SNIPTALE_PRODUCT_VITEST_PARTITION "${value}"`);
}

function resolveSuiteInclude() {
  if (vitestSuite === 'product') {
    if (productPartition === 'jsdom-vm') {
      return productTestInventory?.jsdomVmThreadsFiles ?? [];
    }
    if (productPartition === 'node-vm') return productTestInventory?.nodeVmThreadsFiles ?? [];
    if (productPartition === 'threads') return productTestInventory?.threadsFiles ?? [];
    return [
      'apps/extension/src/**/*.{test,spec}.{ts,tsx}',
      'packages/*/src/**/*.{test,spec}.{ts,tsx}',
    ];
  }
  if (vitestSuite === 'harness') {
    return ['tooling/**/*.{test,spec}.{ts,tsx}'];
  }

  return [
    'apps/extension/src/**/*.{test,spec}.{ts,tsx}',
    'packages/*/src/**/*.{test,spec}.{ts,tsx}',
    'tooling/**/*.{test,spec}.{ts,tsx}',
  ];
}

function resolveCoverageInclude() {
  if (vitestSuite === 'harness') {
    return ['tooling/**/*.{mjs,cjs,js,ts,tsx}'];
  }

  if (!isWrapperCoverageMode && vitestSuite === 'all') {
    return [
      'apps/extension/src/**/*.{ts,tsx}',
      'packages/*/src/**/*.{ts,tsx}',
      'tooling/**/*.{mjs,cjs,js,ts,tsx}',
    ];
  }

  if (wrapperCoverageMode === 'diff' && wrapperCoverageTargets.length > 0) {
    return wrapperCoverageTargets;
  }

  return ['apps/extension/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'];
}

export default defineConfig({
  test: {
    include: resolveSuiteInclude(),
    exclude: ['cases/**', 'tooling/test/e2e/**/*.spec.ts', 'dist/**', 'node_modules/**'],
    setupFiles: ['./tooling/test/harness/vitest.setup.ts'],
    testTimeout: isWrapperTimeoutMode ? 15000 : undefined,
    hookTimeout: isWrapperTimeoutMode ? 15000 : undefined,
    ...(productPoolOverride
      ? { pool: productPoolOverride }
      : productPartition === 'jsdom-vm' || productPartition === 'node-vm'
        ? { pool: 'vmThreads' as const, vmMemoryLimit: '512MB' }
        : vitestSuite === 'product'
          ? { pool: 'threads' as const }
          : {}),
    coverage: {
      provider: useBatchedProductCoverage ? 'custom' : 'v8',
      ...(useBatchedProductCoverage
        ? {
            customProviderModule: './tooling/qa/proof/coverage/profile-v8-coverage-provider.mjs',
          }
        : {}),
      all: vitestSuite === 'harness' || !isWrapperCoverageMode,
      reportsDirectory:
        vitestSuite === 'harness'
          ? './.tmp/coverage/tooling'
          : productPartition
            ? `./.tmp/coverage/unit/partitions/${productPartition}`
            : './.tmp/coverage/unit',
      reporter: vitestSuite === 'product' ? ['json'] : ['text', 'json-summary', 'json', 'html'],
      include: resolveCoverageInclude(),
      ...(useBatchedProductCoverage ? { processingConcurrency: 8 } : {}),
      ...(vitestSuite === 'harness'
        ? {
            reportOnFailure: true,
            thresholds: TOOLING_COVERAGE_THRESHOLDS,
          }
        : {}),
      exclude: [
        'cases/**',
        'dist/**',
        'node_modules/**',
        'tooling/test/e2e/**',
        'apps/extension/src/**/*.test.{ts,tsx}',
        'apps/extension/src/**/*.spec.{ts,tsx}',
        'packages/*/src/**/*.test.{ts,tsx}',
        'packages/*/src/**/*.spec.{ts,tsx}',
        'tooling/**/*.{test,spec}.{mjs,cjs,js,ts,tsx}',
        'tooling/**/*.test-support.{mjs,cjs,js,ts,tsx}',
        'tooling/**/test-support/**',
        'tooling/**/fixtures/**',
        'tooling/test/harness/**',
        'tooling/test/e2e/support/**',
      ],
    },
  },
});
