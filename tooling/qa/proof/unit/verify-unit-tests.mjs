/**
 * Deterministic unit-test gate.
 */

import {
  emitCommandResult,
  getOptionValue,
  isExecutedAsScript,
  parseFilesArgument,
} from '../../runtime/process/shared-cli.mjs';
import { runRepoNodeEntry } from '../../runtime/process/shared-process.mjs';
import { PRODUCT_QA_SUITE, normalizeQaSuite } from '../../composition/scope/qa-scope.mjs';
import { createUnitTestPlan, expandRelatedTestScope } from './unit-test-plan.mjs';

const testEnv = {
  SNIPTALE_QA_LANE_PROCESS: null,
  SNIPTALE_PRODUCT_VITEST_PARTITION: null,
  SNIPTALE_PRODUCT_VITEST_POOL: null,
  TMPDIR: '/tmp',
  TMP: '/tmp',
  TEMP: '/tmp',
};
const WRAPPER_TIMEOUT_MODE = 'wrapper';
const DEFAULT_COVERAGE_MODE = 'diff';
const SUPPORTED_POOLS = new Set(['forks', 'threads']);
const PRODUCT_PARTITIONS = ['jsdom-vm', 'node-vm', 'threads'];

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
  return normalizeUnitTestPool(env.SNIPTALE_PRODUCT_VITEST_POOL);
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
  pool = null,
  productPartition = null,
  suite = PRODUCT_QA_SUITE,
} = {}) {
  const normalizedSuite = normalizeQaSuite(suite);
  const env = {
    ...testEnv,
    SNIPTALE_VITEST_TIMEOUT_MODE: WRAPPER_TIMEOUT_MODE,
    SNIPTALE_VITEST_SUITE: normalizedSuite,
    ...(pool ? { SNIPTALE_PRODUCT_VITEST_POOL: pool } : {}),
    ...(productPartition ? { SNIPTALE_PRODUCT_VITEST_PARTITION: productPartition } : {}),
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

export function resolveProductUnitTestPartitions({
  coverage = false,
  focused = false,
  pool = null,
  suite = PRODUCT_QA_SUITE,
} = {}) {
  return normalizeQaSuite(suite) === PRODUCT_QA_SUITE && pool == null && !coverage && !focused
    ? PRODUCT_PARTITIONS
    : [null];
}

function combineUnitTestResults(results) {
  const failed = results.find((result) => result.status !== 0);
  return {
    ...results.at(-1),
    status: failed?.status ?? 0,
    stderr: results.map((result) => result.stderr ?? '').join(''),
    stdout: results.map((result) => result.stdout ?? '').join(''),
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
  requireTests = false,
  suite = PRODUCT_QA_SUITE,
  cwd,
  env = process.env,
  execute = runRepoNodeEntry,
} = {}) {
  const normalizedSuite = normalizeQaSuite(suite);
  const inheritedProductPool =
    normalizedSuite === PRODUCT_QA_SUITE ? env.SNIPTALE_PRODUCT_VITEST_POOL : null;
  const effectivePool = normalizeUnitTestPool(pool ?? inheritedProductPool);
  const partitions = resolveProductUnitTestPartitions({
    coverage,
    focused: directFiles.length > 0 || relatedFiles.length > 0,
    pool: effectivePool,
    suite: normalizedSuite,
  });
  const run = (args, productPartition) =>
    execute(args[0], args.slice(1), {
      cwd,
      env: createUnitTestEnv({
        coverage,
        coverageMode,
        coverageTargets,
        pool: effectivePool,
        productPartition,
        suite: normalizedSuite,
      }),
      stdio: 'pipe',
    });
  const runPartitions = (args) => {
    const results = [];
    for (const partition of partitions) {
      const result = run(args, partition);
      results.push(result);
      if (result.status !== 0) break;
    }
    const combined = combineUnitTestResults(results);
    return combined;
  };
  if (directFiles.length > 0) {
    const args = createUnitTestArgs({
      allowNoTests: true,
      coverage,
      directFiles,
      maxWorkers,
      pool: effectivePool,
    });

    return runPartitions(args);
  }

  const plan = createUnitTestPlan({ relatedFiles, coverage, requireTests });
  const args = createUnitTestArgs({
    allowNoTests: plan.allowNoTests,
    coverage: plan.coverage,
    maxWorkers,
    pool: effectivePool,
    relatedFiles: plan.expandedRelatedFiles,
  });

  return runPartitions(args);
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
