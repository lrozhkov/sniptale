import { normalizeMediabunny } from './tooling/ci/mediabunny/normalize.mjs';
import { fileURLToPath } from 'node:url';
import { tourPlayerScript } from './apps/extension/build/tour-player-script.ts';
import { defineConfig } from 'vitest/config';

import {
  collectProductTestInventory,
  PRODUCT_TEST_GLOBS,
} from './tooling/test/harness/product-test-inventory.mjs';
import { collectHarnessTestInventory } from './tooling/test/harness/harness-test-inventory.mjs';
import { collectProductionCoverageFiles } from './tooling/qa/proof/coverage/coverage-audit-report.mjs';
import { globSync } from 'tinyglobby';

normalizeMediabunny({ root: fileURLToPath(new URL('.', import.meta.url)), check: true });

type SniptaleVitestSuite = 'product' | 'harness' | 'all';
type HarnessPartition = 'node-vm-a' | 'node-vm-b' | 'jsdom-vm' | 'forks';

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
const isProductCoverage = vitestSuite === 'product';
const useCoverageProfiler = isProductCoverage && process.env.SNIPTALE_COVERAGE_PROFILE === '1';
const productPoolOverride =
  vitestSuite === 'product'
    ? resolveProductPoolOverride(process.env.SNIPTALE_PRODUCT_VITEST_POOL)
    : undefined;
const productPartition =
  vitestSuite === 'product' && productPoolOverride === undefined
    ? resolveProductPartition(process.env.SNIPTALE_PRODUCT_VITEST_PARTITION)
    : undefined;
const useProductProjects =
  vitestSuite === 'product' &&
  productPoolOverride === undefined &&
  productPartition === undefined &&
  process.env.SNIPTALE_PRODUCT_VITEST_PROJECTS === '1';
const productTestInventory =
  productPartition || useProductProjects ? collectProductTestInventory() : null;
const harnessPartition =
  vitestSuite === 'harness'
    ? resolveHarnessPartition(process.env.SNIPTALE_HARNESS_VITEST_PARTITION)
    : undefined;
const harnessTestInventory = harnessPartition ? collectHarnessTestInventory() : null;
const harnessMaxWorkers = harnessPartition
  ? resolveHarnessMaxWorkers(process.env.SNIPTALE_QA_VITEST_MAX_WORKERS)
  : undefined;
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

function resolveHarnessPartition(value: string | undefined): HarnessPartition | undefined {
  if (value == null || value === '') return undefined;
  if (value === 'node-vm-a' || value === 'node-vm-b' || value === 'jsdom-vm' || value === 'forks') {
    return value;
  }
  throw new Error(`Unsupported SNIPTALE_HARNESS_VITEST_PARTITION "${value}"`);
}

function resolveHarnessMaxWorkers(value: string | undefined) {
  if (value == null || value === '') return 4;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Unsupported SNIPTALE_QA_VITEST_MAX_WORKERS "${value}"`);
  }
  return parsed;
}

function resolveSuiteInclude() {
  if (vitestSuite === 'product') {
    if (useProductProjects) return [];
    if (productPartition === 'jsdom-vm') {
      return productTestInventory?.jsdomVmThreadsFiles ?? [];
    }
    if (productPartition === 'node-vm') return productTestInventory?.nodeVmThreadsFiles ?? [];
    if (productPartition === 'threads') return productTestInventory?.threadsFiles ?? [];
    return PRODUCT_TEST_GLOBS;
  }
  if (vitestSuite === 'harness') {
    if (harnessPartition === 'node-vm-a') return harnessTestInventory?.nodeVmThreadsFilesA ?? [];
    if (harnessPartition === 'node-vm-b') return harnessTestInventory?.nodeVmThreadsFilesB ?? [];
    if (harnessPartition === 'jsdom-vm') return harnessTestInventory?.jsdomVmThreadsFiles ?? [];
    if (harnessPartition === 'forks') return harnessTestInventory?.forkFiles ?? [];
    return ['tooling/**/*.{test,spec}.{ts,tsx}'];
  }

  return [...PRODUCT_TEST_GLOBS, 'tooling/**/*.{test,spec}.{ts,tsx}'];
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

function resolveCanonicalCoverageExclude() {
  if (
    vitestSuite !== 'product' ||
    (wrapperCoverageMode !== 'manual' && wrapperCoverageMode !== 'full')
  ) {
    return [];
  }
  const canonicalFiles = new Set(collectProductionCoverageFiles());
  return globSync(['apps/extension/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'], {
    ignore: ['**/*.{test,spec}.{ts,tsx}'],
  })
    .filter((file) => !canonicalFiles.has(file))
    .sort();
}

export default defineConfig({
  plugins: [tourPlayerScript()],
  test: {
    css: { include: [/\.css\?raw$/u] },
    include: resolveSuiteInclude(),
    ...(useProductProjects
      ? {
          vmMemoryLimit: '512MB',
          projects: [
            {
              test: {
                name: 'vm',
                include: PRODUCT_TEST_GLOBS,
                exclude: productTestInventory?.threadsFiles ?? [],
                pool: 'vmThreads' as const,
              },
            },
            {
              test: {
                name: 'threads',
                include: productTestInventory?.threadsFiles ?? [],
                pool: 'threads' as const,
              },
            },
          ],
        }
      : {}),
    exclude: ['cases/**', 'tooling/test/e2e/**/*.spec.ts', 'dist/**', '**/node_modules/**'],
    clearMocks: false,
    setupFiles: ['./tooling/test/harness/vitest.setup.ts'],
    testTimeout: isWrapperTimeoutMode ? 15000 : undefined,
    hookTimeout: isWrapperTimeoutMode ? 15000 : undefined,
    ...(harnessMaxWorkers ? { maxWorkers: harnessMaxWorkers } : {}),
    ...(productPoolOverride
      ? { pool: productPoolOverride }
      : productPartition === 'jsdom-vm' || productPartition === 'node-vm'
        ? { pool: 'vmThreads' as const, vmMemoryLimit: '512MB' }
        : harnessPartition === 'forks'
          ? { pool: 'forks' as const }
          : harnessPartition
            ? { pool: 'vmThreads' as const, vmMemoryLimit: '512MB' }
            : vitestSuite === 'product'
              ? { pool: 'threads' as const }
              : {}),
    coverage: {
      provider: useCoverageProfiler ? 'custom' : 'v8',
      ...(useCoverageProfiler
        ? {
            customProviderModule: './tooling/qa/proof/coverage/profile-v8-coverage-provider.mjs',
          }
        : {}),
      reportsDirectory:
        vitestSuite === 'harness'
          ? './.tmp/coverage/tooling'
          : productPartition
            ? `./.tmp/coverage/unit/partitions/${productPartition}`
            : './.tmp/coverage/unit',
      reporter: vitestSuite === 'product' ? ['json'] : ['text', 'json-summary', 'json', 'html'],
      include: resolveCoverageInclude(),
      ...(isProductCoverage ? { processingConcurrency: 8 } : {}),
      ...(vitestSuite === 'harness'
        ? {
            reportOnFailure: true,
            thresholds: TOOLING_COVERAGE_THRESHOLDS,
          }
        : {}),
      exclude: [
        ...resolveCanonicalCoverageExclude(),
        'cases/**',
        'dist/**',
        '**/node_modules/**',
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
