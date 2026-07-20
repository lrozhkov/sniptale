/**
 * Deterministic unit-test gate.
 */

import {
  emitCommandResult,
  getOptionValue,
  isExecutedAsScript,
  parseFilesArgument,
  runRepoNodeEntry,
} from './shared.mjs';
import { PRODUCT_QA_SUITE, normalizeQaSuite } from './qa-scope.mjs';
import { createUnitTestPlan, expandRelatedTestScope } from './unit-test-plan.mjs';

const testEnv = {
  TMPDIR: '/tmp',
  TMP: '/tmp',
  TEMP: '/tmp',
};
const WRAPPER_TIMEOUT_MODE = 'wrapper';
const DEFAULT_COVERAGE_MODE = 'diff';
const SUPPORTED_POOLS = new Set(['forks', 'threads']);

export { expandRelatedTestScope };

export function normalizeUnitTestPool(pool = null) {
  if (pool == null || pool === '') {
    return null;
  }
  if (SUPPORTED_POOLS.has(pool)) {
    return pool;
  }

  throw new Error(`Unsupported Vitest pool "${pool}". Expected forks or threads.`);
}

export function resolveProductUnitTestPool(env = process.env) {
  return normalizeUnitTestPool(env.SNIPTALE_PRODUCT_VITEST_POOL ?? null);
}

export function createUnitTestArgs({
  allowNoTests = true,
  coverage = false,
  directFiles = [],
  maxWorkers = null,
  pool = null,
  relatedFiles = [],
} = {}) {
  const args = [
    'node_modules/vitest/vitest.mjs',
    directFiles.length > 0 || relatedFiles.length === 0 ? 'run' : 'related',
  ];

  if (directFiles.length > 0) {
    args.push(...directFiles);
    if (allowNoTests) {
      args.push('--passWithNoTests');
    }
  } else if (relatedFiles.length > 0) {
    args.push(...relatedFiles, '--run');
    if (allowNoTests) {
      args.push('--passWithNoTests');
    }
  }

  if (coverage) {
    args.push('--coverage');
  }

  if (maxWorkers != null) {
    if (!Number.isInteger(maxWorkers) || maxWorkers < 1) {
      throw new Error('Vitest maxWorkers must be a positive integer.');
    }
    args.push(`--maxWorkers=${maxWorkers}`);
  }

  const normalizedPool = normalizeUnitTestPool(pool);
  if (normalizedPool) {
    args.push(`--pool=${normalizedPool}`);
  }

  return args;
}

export function createUnitTestEnv({
  coverage = false,
  coverageMode = DEFAULT_COVERAGE_MODE,
  coverageTargets = [],
  suite = PRODUCT_QA_SUITE,
} = {}) {
  const normalizedSuite = normalizeQaSuite(suite);
  const env = {
    ...testEnv,
    SNIPTALE_VITEST_TIMEOUT_MODE: WRAPPER_TIMEOUT_MODE,
    SNIPTALE_VITEST_SUITE: normalizedSuite,
  };

  if (!coverage || coverageMode === 'manual') {
    return env;
  }

  return {
    ...env,
    SNIPTALE_VITEST_COVERAGE_MODE: coverageMode,
    ...(coverageMode === 'diff' && coverageTargets.length > 0
      ? {
          SNIPTALE_VITEST_COVERAGE_TARGETS: JSON.stringify(coverageTargets),
        }
      : {}),
  };
}

export function runUnitTests({
  coverage = false,
  coverageMode,
  coverageTargets = [],
  directFiles = [],
  maxWorkers = null,
  pool = null,
  relatedFiles = [],
  suite = PRODUCT_QA_SUITE,
  cwd,
} = {}) {
  const normalizedSuite = normalizeQaSuite(suite);
  if (directFiles.length > 0) {
    const args = createUnitTestArgs({
      allowNoTests: true,
      coverage,
      directFiles,
      maxWorkers,
      pool,
    });

    return runRepoNodeEntry(args[0], args.slice(1), {
      cwd,
      env: createUnitTestEnv({ coverage, coverageMode, coverageTargets, suite: normalizedSuite }),
      stdio: 'pipe',
    });
  }

  const plan = createUnitTestPlan({ relatedFiles, coverage });
  const args = createUnitTestArgs({
    allowNoTests: plan.allowNoTests,
    coverage: plan.coverage,
    maxWorkers,
    pool,
    relatedFiles: plan.expandedRelatedFiles,
  });

  return runRepoNodeEntry(args[0], args.slice(1), {
    cwd,
    env: createUnitTestEnv({ coverage, coverageMode, coverageTargets, suite: normalizedSuite }),
    stdio: 'pipe',
  });
}

if (isExecutedAsScript(import.meta.url)) {
  const argv = process.argv.slice(2);
  const result = runUnitTests({
    coverage: argv.includes('--coverage'),
    pool: getOptionValue(argv, '--pool'),
    relatedFiles: parseFilesArgument(argv),
    suite: getOptionValue(argv, '--suite') ?? PRODUCT_QA_SUITE,
  });

  emitCommandResult(result, 'Unit tests passed\n');
}
