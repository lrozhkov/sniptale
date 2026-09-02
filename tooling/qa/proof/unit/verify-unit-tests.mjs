/**
 * Deterministic unit-test gate.
 */

import { spawn } from 'node:child_process';

import {
  emitCommandResult,
  getOptionValue,
  isExecutedAsScript,
  parseFilesArgument,
} from '../../runtime/process/shared-cli.mjs';
import { runRepoNodeEntry } from '../../runtime/process/shared-process.mjs';
import { fromRelativePath } from '../../analysis/repository/shared-paths.mjs';
import {
  HARNESS_QA_SUITE,
  PRODUCT_QA_SUITE,
  normalizeQaSuite,
} from '../../composition/scope/qa-scope.mjs';
import { createUnitTestPlan, expandRelatedTestScope } from './unit-test-plan.mjs';

const testEnv = {
  SNIPTALE_QA_LANE_PROCESS: null,
  SNIPTALE_HARNESS_VITEST_PARTITION: null,
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
const HARNESS_PARTITIONS = ['node-vm-a', 'node-vm-b', 'jsdom-vm', 'forks'];
const MAX_CHILD_OUTPUT_BYTES = 64 * 1024 * 1024;

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

function normalizeVitestOperand(path) {
  return path.startsWith('./') ? path : `./${path}`;
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
  const operands = directFiles.length > 0 ? directFiles : relatedFiles;

  if (directFiles.length > 0) {
    if (allowNoTests) {
      args.push('--passWithNoTests');
    }
  } else if (relatedFiles.length > 0) {
    args.push('--run');
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

  if (operands.length > 0) {
    args.push(...operands.map(normalizeVitestOperand));
  }

  return args;
}

export function createUnitTestEnv({
  coverage = false,
  coverageMode = DEFAULT_COVERAGE_MODE,
  coverageTargets = [],
  harnessPartition = null,
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
    ...(harnessPartition ? { SNIPTALE_HARNESS_VITEST_PARTITION: harnessPartition } : {}),
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

export function resolveHarnessUnitTestPartitions({
  coverage = false,
  focused = false,
  pool = null,
  suite = PRODUCT_QA_SUITE,
} = {}) {
  return normalizeQaSuite(suite) === 'harness' && pool == null && !coverage && !focused
    ? HARNESS_PARTITIONS
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

function terminateChildProcessGroup(child) {
  if (process.platform !== 'win32' && Number.isInteger(child.pid)) {
    try {
      process.kill(-child.pid, 'SIGKILL');
      return;
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  }
  child.kill('SIGKILL');
}

export function runRepoNodeEntryAsync(
  entryPath,
  args,
  {
    cwd,
    env,
    maxBuffer = MAX_CHILD_OUTPUT_BYTES,
    spawnImpl = spawn,
    terminateImpl = terminateChildProcessGroup,
  } = {}
) {
  return new Promise((resolve, reject) => {
    const childEnvironment = { ...process.env };
    for (const [name, value] of Object.entries(env ?? {})) {
      if (value == null) delete childEnvironment[name];
      else childEnvironment[name] = String(value);
    }
    const child = spawnImpl(process.execPath, [fromRelativePath(entryPath), ...args], {
      cwd,
      detached: process.platform !== 'win32',
      env: childEnvironment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let overflowed = false;
    const appendOutput = (channel, chunk) => {
      if (overflowed) return;
      const chunkBytes = Buffer.byteLength(chunk);
      if (outputBytes + chunkBytes > maxBuffer) {
        overflowed = true;
        terminateImpl(child);
        return;
      }
      outputBytes += chunkBytes;
      if (channel === 'stdout') stdout += chunk;
      else stderr += chunk;
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      appendOutput('stdout', chunk);
    });
    child.stderr.on('data', (chunk) => {
      appendOutput('stderr', chunk);
    });
    child.once('error', (error) => {
      if (!overflowed) reject(error);
    });
    child.once('close', (status, signal) => {
      resolve({
        status: overflowed ? 1 : (status ?? 1),
        signal,
        stdout,
        stderr: overflowed
          ? `${stderr}${stderr.endsWith('\n') || stderr.length === 0 ? '' : '\n'}` +
            `Harness child output exceeded ${maxBuffer} bytes.\n`
          : stderr,
      });
    });
  });
}

function resolveHarnessWorkerBudget(env = process.env) {
  const configured = Number(env.SNIPTALE_QA_VITEST_MAX_WORKERS ?? 12);
  if (!Number.isInteger(configured) || configured < 1) {
    throw new Error('SNIPTALE_QA_VITEST_MAX_WORKERS must be a positive integer.');
  }
  return configured;
}

export async function runFullHarnessUnitTests({
  cwd,
  env = process.env,
  execute = runRepoNodeEntryAsync,
} = {}) {
  const workerBudget = resolveHarnessWorkerBudget(env);
  const concurrency = Math.min(workerBudget, HARNESS_PARTITIONS.length);
  const maxWorkers = Math.max(1, Math.floor(workerBudget / concurrency));
  const args = createUnitTestArgs({ allowNoTests: false });
  const results = [];
  for (let offset = 0; offset < HARNESS_PARTITIONS.length; offset += concurrency) {
    const wave = HARNESS_PARTITIONS.slice(offset, offset + concurrency);
    results.push(
      ...(await Promise.all(
        wave.map((harnessPartition) =>
          execute(args[0], args.slice(1), {
            cwd,
            env: {
              ...createUnitTestEnv({
                harnessPartition,
                suite: HARNESS_QA_SUITE,
                pool: null,
              }),
              SNIPTALE_QA_VITEST_MAX_WORKERS: String(maxWorkers),
            },
          })
        )
      ))
    );
  }
  return combineUnitTestResults(results);
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
  const focused = directFiles.length > 0 || relatedFiles.length > 0;
  const productPartitions = resolveProductUnitTestPartitions({
    coverage,
    focused,
    pool: effectivePool,
    suite: normalizedSuite,
  });
  const harnessPartitions = resolveHarnessUnitTestPartitions({
    coverage,
    focused,
    pool: effectivePool,
    suite: normalizedSuite,
  });
  const partitions =
    normalizedSuite === 'harness'
      ? harnessPartitions.map((harnessPartition) => ({ harnessPartition, productPartition: null }))
      : productPartitions.map((productPartition) => ({ harnessPartition: null, productPartition }));
  const run = (args, { harnessPartition, productPartition }) =>
    execute(args[0], args.slice(1), {
      cwd,
      env: createUnitTestEnv({
        coverage,
        coverageMode,
        coverageTargets,
        harnessPartition,
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
  const coverage = argv.includes('--coverage');
  const pool = getOptionValue(argv, '--pool');
  const relatedFiles = parseFilesArgument(argv);
  const suite = getOptionValue(argv, '--suite') ?? PRODUCT_QA_SUITE;
  const result =
    suite === HARNESS_QA_SUITE && !coverage && pool == null && relatedFiles.length === 0
      ? await runFullHarnessUnitTests()
      : runUnitTests({ coverage, pool, relatedFiles, suite });

  emitCommandResult(result, 'Unit tests passed\n');
}
